'''
This script iterates over all .js files in a local copy of the
GameServerJS repository, and adjusts them in a way that makes them
usable for the Eleven game server.
This is mostly a quick and dirty hack, because (a) I'm too lazy to
learn how to use a JS syntax tree parser, and (b) it works.

Take care setting the DST_PATH variable below - the script will
overwrite stuff in that directory without warning!
'''
import errno
import logging
import os
import os.path
from os.path import sep
import re
import sys


LOGLEVEL_TRACE = 5  # custom log level

SCRIPT_PATH = os.path.dirname(os.path.realpath(__file__))
SRC_PATH = os.path.realpath(os.path.join(SCRIPT_PATH, '../../eleven-gsjs'))
DST_PATH = os.path.realpath(os.path.join(SCRIPT_PATH, '../src/gsjs'))  # take care - script will overwrite things in here without warning! 

INCLUDE_PREFIX = '//#include'

EXCLUDE_DIRS = set(['.git'])

GLOBAL_EXPORT = ['common.js']
MODULE_EXPORT = ['main.js']
GLOBAL_API = [
    'NewItem', 'NewItemFromSource', 'NewItemFromFamiliar', 'NewItemFromXY',
    'NewItemStack', 'NewItemStackFromSource', 'NewItemStackFromFamiliar',
    'NewItemStackFromXY', 'FindItemPrototype', 'NewProperty', 'NewOrderedHash',
    'NewGroup', 'NewGroupForHub', 'NewLocation', 'FindObject',
    'GetObjectContent', 'IsPlayerOnline', 'NewDC', 'NewQuest', 'NewOwnedDC',
    'NewOwnedQuest', 'FindQuestPrototype', 'NewBag', 'SendMsgWithEffects',
    'SendMsgWithEffectsX', 'SendLocationEventsWithEffects', 'SendToAll',
    'SendToAllByCondition', 'SendToHub', 'SendToGroup', 'AsyncHttpCall',
    'LogAction', 'AdminLockLocations', 'AdminUnlockLocations',
    'GetJSFileObject', 'CallMethod', 'CallMethodForOnlinePlayers',
    'ExecuteInParallel', 'AdminCall', 'FindGlobalPath', 'FindGlobalPathX',
    'FindShortestGlobalPath', 'ReloadDataForGlobalPathFinding', 'MD5',
    'GetNLocalOnlinePlayers', 'CopyHash', 'ResetThreadCPUClock',
    'ResetCPUTimes', 'GetCPUTimes', 'ResetObjectCreationCounter']


def process_includes(module, lines):
    '''
    Converts //#include statements into corresponding include() calls.
    '''
    log.trace('processing includes for %s' % module)
    out = []
    for line in lines:
        if not line.startswith(INCLUDE_PREFIX):
            out.append(line.rstrip('\r\n'))
        else:
            log.trace('#include directive: %s' % line.strip())
            incfiles = line[line.find(INCLUDE_PREFIX) + len(INCLUDE_PREFIX):].split()
            incfiles = ['.%s%s' % (sep, s.strip(',')) for s in incfiles if s.strip != '']
            for incfile in incfiles:
                out.append('include(__dirname, \'%s\', this);' % incfile)
    return out


def get_function_name(line):
    '''
    Returns the function name if the given line starts with a
    (non-indented) function declaration, otherwise None.
    '''
    if not line.startswith('function '):
        return None
    else:
        return line[len('function '):line.find('(')].strip()


def process_export_functions(module, lines):
    '''
    Exports all of the module's functions, either in the module or
    global namespace (depending on whether the module is in the
    MODULE_EXPORT or GLOBAL_EXPORT list).
    '''
    log.trace('exporting functions for %s' % module)
    i = 0
    while i < len(lines):
        if get_function_name(lines[i]) is not None:
            fname = get_function_name(lines[i])
            log.trace('exporting global function "%s"' % fname)
            if module in GLOBAL_EXPORT:
                namespace = 'global'
            elif module in MODULE_EXPORT:
                namespace = 'exports'
            lines.insert(i, '%s.%s = %s;' % (namespace, fname, fname))
            i += 1
        i += 1


def process_classify(module, lines):
    '''
    Converts the given module into something that can be used by the
    game server to append specific properties to "bare" game object
    prototypes.
    Makes all top-level variables and functions properties of 'this',
    which will be set to the prototype (via a wrapper that is called
    through Javascript's Function.prototype.call) when the GS loads
    the file.
    '''
    log.debug('converting %s to prototype class template' % (module))
    i = 0
    varnames = []
    while i < len(lines):
        if get_function_name(lines[i]) is not None:
            l = lines[i]
            fname = get_function_name(l)
            lines[i] = 'this.%s = function%s' % (fname, l[l.find('('):])
        elif lines[i].startswith('var '):
            # hacky - just assumes all non-indented vars belong to the module namespace
            varname = lines[i][len('var '):].strip()
            varname = varname[:varname.find('=')].strip()
            varnames.append(varname)
            lines[i] = lines[i].replace('var ', 'this.', 1)
        # horrible special cases for items: 
        elif lines[i].strip() == 'if (this.consumable_label_single) itemDef.consumable_label_single = this.consumable_label_single;':
            lines[i] = 'if (this.consumable_label_single) this.itemDef.consumable_label_single = this.consumable_label_single;'
        elif lines[i].strip() == 'if (this.consumable_label_plural) itemDef.consumable_label_plural = this.consumable_label_plural;':
            lines[i] = 'if (this.consumable_label_plural) this.itemDef.consumable_label_plural = this.consumable_label_plural;'
        else:
            for v in varnames:
                if lines[i].startswith('%s.' % v):
                    lines[i] = 'this.%s' % (lines[i])
            i += 1
    # wrap in prototype composer function (see gsjsBridge in GS)
    lines.insert(0, 'module.exports = function (include, api, utils, config) {  // GS import wrapper START')
    lines.insert(1, '')
    lines.append('')
    lines.append('};  // GS import wrapper END')


def apify(module, lines):
    '''
    Prefixes calls to global API functions with 'api.'.
    '''
    for i in range(len(lines)):
        if lines[i].find('api') != -1 and not lines[i].strip().startswith('function '):
            # find global API function calls (the ones not prefixed with a '.'):
            for fname in re.findall(r'(?:^|[^\.])api(\w+)\(', lines[i]):
                if fname in GLOBAL_API:
                    lines[i] = re.sub(r'(^|[^\.])api(\w+)\(', r'\1api.api\2(', lines[i])
            # correct some global API calls that are incorrectly prefixed with 'this.':
            for fname in re.findall(r'this\.api(\w+)\(', lines[i]):
                if fname in GLOBAL_API:
                    lines[i] = re.sub(r'this\.api(\w+)\(', r'api.api\1(', lines[i])


def mk_dest_dir(module):
    path = DST_PATH
    if module.find(sep) != -1:
        dir = module[:module.rfind(sep)]
        path = sep.join([DST_PATH, dir])
    try:
        os.makedirs(path)
    except OSError as e:
        if e.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise


def process(module):
    log.debug('processing %s' % module)
    mk_dest_dir(module)
    with open(sep.join([SRC_PATH, module])) as f:
        lines = f.readlines()
    if module in GLOBAL_EXPORT or module in MODULE_EXPORT:
        process_export_functions(module, lines)
    else:
        process_classify(module, lines)
    lines = process_includes(module, lines)
    apify(module, lines)
    # output
    outfile = sep.join([DST_PATH, module])
    log.trace('writing %s' % outfile)
    with open(outfile, 'w') as f:
        for line in lines:
            f.write(line)
            f.write('\n')


def init_logging():
    # add custom log level TRACE
    logging.addLevelName(LOGLEVEL_TRACE, 'TRACE')
    def trace(self, message, *args, **kws):
        if self.isEnabledFor(LOGLEVEL_TRACE):
            self._log(LOGLEVEL_TRACE, message, args, **kws)
    logging.Logger.trace = trace
    # configure global logger
    global log
    log = logging.getLogger(__name__)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter('[%(levelname)s] %(message)s'))
    handler.setLevel(LOGLEVEL_TRACE)
    log.setLevel(LOGLEVEL_TRACE)
    log.addHandler(handler)


def main():
    init_logging()
    log.setLevel(logging.INFO)  # be quite quiet by default
    log.info('processing GSJS files for eleven-server')
    log.info('input: %s' % SRC_PATH)
    log.info('output: %s' % DST_PATH)
    if not os.path.isdir(SRC_PATH):
        log.fatal(('directory "%s" does not exist - pull a copy of the ' +
            'eleven-gsjs repository, and/or adjust the SRC_PATH variable') %
            SRC_PATH)
        sys.exit(1)
    # process GSJS files one by one
    for dir, dirs, files in os.walk(SRC_PATH):
        for excl in EXCLUDE_DIRS:
            if excl in dirs:
                log.debug('skipping excluded directory %s' % os.path.join(dir, excl))
                dirs.remove(excl)
        reldir = dir[dir.find(SRC_PATH) + len(SRC_PATH) + 1:]
        if reldir:
            log.info('processing directory %s' % reldir)
        for file in files:
            if reldir == '':
                modpath = file
            else:
                modpath = sep.join([reldir, file])
            if not file.endswith('.js'):
                log.debug('skipping non-JS file %s' % modpath)
                continue
            process(modpath)


if __name__ == '__main__':
    main()
