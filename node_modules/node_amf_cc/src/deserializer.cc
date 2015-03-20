#define BUILDING_NODE_EXTENSION 1
#define DEBUG 0
#include <node.h>

#include "amf.h"
#include "deserializer.h"
#include "utils.h"

using namespace AMF;
using namespace v8;

// TODO: clean up obj ref hacks to make it more readable; temp stack var is ugly
// TODO: way better error messages
// TODO: trigger GC to make sure no leaks

Deserializer::Deserializer() {
}

Deserializer::~Deserializer() { 
}

void Deserializer::Init(Handle<Object> exports) {
  exports->Set(NanNew<String>("deserialize"),
      NanNew<FunctionTemplate>(Run)->GetFunction());
}

NAN_METHOD(Deserializer::Run) {
  NanEscapableScope();

  if (args.Length() != 1) {
    NanThrowError("Need exactly one argument");
  }
 
  std::auto_ptr<Deserializer> obj(new Deserializer());
  obj->init(args[0]->ToString());
  Handle<Object> returnValue = NanNew<Object>();
  returnValue->Set(NanNew<String>("value"), 
      obj->readValue(obj->buffer_->getRegion()));
  returnValue->Set(NanNew<String>("consumed"), 
      NanNew<Integer>(obj->buffer_->getRegion()->consumed())); 
  NanReturnValue(returnValue);
}

void Deserializer::init(Handle<String> payload) {
  buffer_.reset(new ReadBuffer(payload));
}

Handle<Value> Deserializer::readValue(ReadBuffer::Region* region) {
  uint8_t marker = AMF3_UNDEFINED;
  region->readUInt8(&marker);
#if DEBUG
  printf("marker=%d\n", marker);
#endif 
  switch (marker) {
    case AMF3_UNDEFINED: 
      return NanUndefined();
    case AMF3_NULL:
      return NanNull();
    case AMF3_FALSE:
      return NanFalse();
    case AMF3_TRUE:
      return NanTrue();
    case AMF3_INTEGER:
      return readInteger(region);
    case AMF3_DOUBLE:
      return readDouble(region);
    case AMF3_STRING:
      return readUTF8(region);
    case AMF3_ARRAY:
      return readArray(region);
    case AMF3_OBJECT:
      return readObject(region);
    case AMF3_DATE:
      return readDate(region);
    default: 
      NanThrowError("Unsupported AMF3 marker");
  }  
  return NanUndefined();
}

Handle<Integer> Deserializer::readInteger(ReadBuffer::Region* region) {
  int32_t v;
  if (!region->readInt29(&v)) {
    NanThrowError("Integer expected but not found at position"); 
  }
  return NanNew<Integer>(v);
}

Handle<Number> Deserializer::readDouble(ReadBuffer::Region* region) {
  double v;
  if (!region->readDouble(&v)) {
    // TODO: make NanThrowError take varargs and format string
    NanThrowError("Double expected but not found at position");
  }
  return NanNew<Number>(v);
}


Handle<String> toString(ReadRegion* region, int32_t len) {
  uint8_t* str = NULL;
  if (!region->read(&str, len)) {
    NanThrowError("String expected but not long enough");
  }
#if DEBUG
  printf("utf8=%.*s\n", len, (char*)str); 
#endif
  return NanNew<String>(reinterpret_cast<char*>(str), len);
}

Handle<String> Deserializer::readUTF8(ReadRegion* region) {
  int32_t n = 0;
  if (!region->readInt29(&n)) {
    NanThrowError("String expected but no length information found");
  }

  if (n & 1) {
    int32_t len = n >> 1;
    // index string unless empty
    if (len == 0) {
      return NanNew<String>("");
    }
    strRefs_.push_back(region->copy(len));
    return toString(region, len);
  } else {
    uint32_t refIndex = n >> 1;
    if (refIndex >= strRefs_.size()) {
      NanThrowError("No string reference at index!");
    }
    ReadRegion temp = strRefs_[refIndex].copy();
    return toString(&temp, temp.remainingLength());
  }
}

Handle<Array> Deserializer::readArray(ReadBuffer::Region* region) {
  int32_t n = 0;
  if (!region->readInt29(&n)) {
    NanThrowError("Array length not found");
  }

  if (n & 1) {
    int32_t len = n >> 1;
    objRefs_.push_back(makeRef(region->copy(), len));
    return readArrayWithLength(region, len);
  } else {
    uint32_t refIndex = n >> 1;
    if (refIndex >= objRefs_.size()) {
      NanThrowError("No object reference at index!");
    }
    ObjRef ref = objRefs_[refIndex];
    return readArrayWithLength(&ref.region, ref.attr);
  }
}

Handle<Array> Deserializer::readArrayWithLength(
    ReadBuffer::Region* region, int32_t len) {
  // Skip the associative portion of the array: unsupported in Javascript
  while (readUTF8(region)->Length() != 0) {
    readValue(region);
  }
 
  Handle<Array> a = NanNew<Array>(len);
  for (int i = 0; i < len; i++) {
    a->Set(i, readValue(region));
  }
  return a;
}

inline bool isObjectReferenceFlag(int32_t n) {
  return ((n & 1) == 0);
}

inline bool isTraitReferenceFlag(int32_t n) {
  return ((n & 3) == 1); 
}

inline bool isTraitDeclarationFlag(int32_t n) {
  return((n & 7) == 3);
}

inline bool isExternalizableTraitFlag(int32_t n) {
  return ((n & 7) == 7);
}


Handle<Object> Deserializer::readObject(ReadBuffer::Region* region) {
  int32_t n = 0;
  if (!region->readInt29(&n)) {
    NanThrowError("Object attributes not found");
  }

  if (isObjectReferenceFlag(n)) {
    // Reconstruct object reference ad re-parse it.
    uint32_t refIndex = n >> 1;
    if (refIndex >= objRefs_.size()) {
      NanThrowError("No object reference at index!");
    }
    ObjRef ref = objRefs_[refIndex];
    return readObjectWithFlag(&ref.region, ref.attr);
  } else {
    objRefs_.push_back(makeRef(region->copy(), n));
    return readObjectWithFlag(region, n);
  } 
}

Handle<Object> Deserializer::readObjectWithFlag(
    ReadBuffer::Region* region, int32_t n) {
  if (isObjectReferenceFlag(n)) {
    NanThrowError("Fatal error - obect reference flag passed to readObjectWithFlag");
  } else if (isExternalizableTraitFlag(n)) {
    NanThrowError("Externalizable traits not supported!");
  } else if (isTraitDeclarationFlag(n)) {
    Traits traits;
    traits.dynamic = (n & 8) ? true : false;
    (void)readUTF8(region);  // classname
    int32_t num_props = n >> 4;
    for (int i = 0; i < num_props; i++) {
      traits.props.push_back(readUTF8(region));
    }
    traitRefs_.push_back(traits); 
    return readObjectFromRegionAndTraits(region, traits);
  } else if (isTraitReferenceFlag(n)) {
    uint32_t refIndex = n >> 2;
    if (refIndex >= traitRefs_.size()) {
      NanThrowError("No trait reference at index!");
    }
    Traits traits = traitRefs_[refIndex];
    return readObjectFromRegionAndTraits(region, traits);
  } else {
    NanThrowError("Unrecognized flag!"); 
  }
  return NanNew<Object>();  // workaround compiler warning. We'll never get here. 
}

void Deserializer::readObjectDynamicProps(
    ReadBuffer::Region* region, Handle<Object> o) {
  Handle<String> key;
  while (!(key = readUTF8(region)).IsEmpty() && key->Length() != 0) {
    o->Set(key, readValue(region));
  } 
}

Handle<Object> Deserializer::readObjectFromRegion(ReadBuffer::Region* region) {
  Handle<Object> o = NanNew<Object>();
  (void)readUTF8(region);  // object's class name
  readObjectDynamicProps(region, o);
  return o;
}

Handle<Object> Deserializer::readObjectFromRegionAndTraits(
    ReadBuffer::Region* region, const Traits& traits) {
  Handle<Object> o = NanNew<Object>();
  for (uint32_t i = 0; i < traits.props.size(); i++) {
    o->Set(traits.props[i], readValue(region));
  }
  if (traits.dynamic) {
    readObjectDynamicProps(region, o);
  }
  return o;
}

Handle<Value> Deserializer::readDate(ReadBuffer::Region* region) {
  int32_t n = 0;
  if (!region->readInt29(&n)) {
    NanThrowError("Object attributes not found");
  }
  if (n & 1) {
    objRefs_.push_back(makeRef(region->copy(8), 0));
  } else {
    uint32_t refIndex = n >> 1;
    if (refIndex >= objRefs_.size()) {
      NanThrowError("No object reference at index!");
    }
    ReadRegion temp = objRefs_[refIndex].region.copy();
    region = &temp;
  }
  double time;
  if (!region->readDouble(&time)) {
    NanThrowError("Time expected");
  }
  return NanNew<Date>(time);
}

Deserializer::ObjRef::ObjRef() : attr(0) { }

Deserializer::ObjRef Deserializer::makeRef(
    ReadBuffer::Region region, int32_t attr) {
  ObjRef ref;
  ref.region = region;
  ref.attr = attr;
  return ref;
}

Deserializer::Traits::Traits() : dynamic(false) { }

