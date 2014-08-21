// `isAsync` checks for the `async` property and if it doesn't exist, and the `sync` property
// doesn't exist, then it attempts to "guess" whether a function is asynchronous (based on
// the number of named arguments). Further checks could be done (such as scouring the source
// code of the function for a `return` statement) but are performance cost-prohibiitive, and
// the developer can use the `Async` methods to clarify it is actually async in that case.
function isAsync(method, asyncArgLength) {
    return method.async || (!method.sync && method.length === asyncArgLength);
}

module.exports = isAsync;