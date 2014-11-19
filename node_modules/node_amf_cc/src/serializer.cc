/*
"If possible, build it in Javascript."
   - https://kkaefer.com/node-cpp-modules/#benchmark-thread-pool
*/
#define BUILDING_NODE_EXTENSION 1
#include <math.h>  // isnan
#include <memory>
#include <node.h>

#include "amf.h"
#include "serializer.h"
#include "utils.h"

using namespace v8;

namespace {
const int INSTANCE_NO_TRAITS_NO_EXTERNALIZABLE = 11;

const uint8_t SERIALIZED_NaN[] = { 0, 0, 0, 0, 0, 0, 248, 127 };
}

int Serializer::bigEndian = 0;

Serializer::Serializer() {
  clear(); 
}

Serializer::~Serializer() { 
}

void Serializer::Init(Handle<Object> exports) {
  bigEndian = isBigEndian();

  exports->Set(String::NewSymbol("serialize"),
      Persistent<Function>::New(FunctionTemplate::New(Run)->GetFunction()));
}

Handle<Value> Serializer::Run(const Arguments& args) {
  HandleScope scope;

  if (args.Length() != 1) {
    die("Need exactly one argument");
  }

  // If argument is not valid, you can validate it by calling JSON.parse(JSON.stringify(args[0])) i.e.
  // http://stackoverflow.com/questions/15990445/accessing-json-stringify-from-node-js-c-bindings

  std::auto_ptr<Serializer> obj(new Serializer()); 
  obj->writeValue(args[0]);
  return scope.Close(obj->buffer_.toString());
}

void Serializer::clear() {
  objRefs_.clear();
  buffer_.clear();
}

// Begin straight-up port of node-amf's serialize.js

/**
 * Write any JavaScript value, automatically chooses which data type to use
 * @param mixed
 */
void Serializer::writeValue(Handle<Value> value) {
  if (value.IsEmpty() || value->IsUndefined()) {
    writeUndefined();
  } else if (value->IsNull()) {
    writeNull();
  } else if (value->IsString()) {
    writeUTF8(value->ToString(), true);
  } else if (value->IsNumber()) {
    writeNumber(value, true);
  } else if (value->IsBoolean()) {
    writeBool(value->ToBoolean());
  } else if (value->IsArray()) {
    writeArray(Handle<Array>(Array::Cast(*value)));
  } else if (value->IsDate()) {
    writeDate(value->ToObject());
  } else if (value->IsObject()) {
    // else write vanilla Object
    writeObject(value->ToObject());
  } else {
    // Unknown type. TODO: error?
    writeUndefined();
  }
}

void Serializer::writeUndefined() {
  writeU8(AMF::AMF3_UNDEFINED);
} 

void Serializer::writeNull() {
  writeU8(AMF::AMF3_NULL);
}

void Serializer::writeBool(Handle<Boolean> value) {
  writeU8(value->Value() ? AMF::AMF3_TRUE : AMF::AMF3_FALSE);
}

void Serializer::writeUTF8(Handle<String> value, bool writeMarker) {
  int encodedLen = value->Utf8Length();
  if (writeMarker) {
    writeU8(AMF::AMF3_STRING);
  }
  int flag = (encodedLen << 1) | 1;
  writeU29(flag);

  std::vector<char> utf8str(encodedLen+1);
  value->WriteUtf8(utf8str.data());
  //printf("Encoding: [%s] at pos %d\n", utf8str.data(), buffer_.bytes_.size()) ;
  for (int i = 0; i < encodedLen; ++i) {
    writeU8(static_cast<unsigned char>(utf8str.data()[i]));
  }
}

void Serializer::writeArray(Handle<Array> value) {
  writeU8(AMF::AMF3_ARRAY);
  // NOT supporting object references in serialization
  int len = value->Length(); 
  // flag with XXXXXXX1 indicating length of dense portion with instance
  int flag = ( len << 1 ) | 1;
  writeU29(flag);
  writeUTF8(String::Empty());
  for (int i = 0; i < len; i++) {
    writeValue(value->Get(i));
  }
}

void Serializer::writeObject(Handle<Object> value) {
  writeU8(AMF::AMF3_OBJECT);
  int valueId = value->GetIdentityHash();
  // support object references
  if (objRefs_.find(valueId) != objRefs_.end()) {
    writeU29(objRefs_[valueId] << 1);
    return;
  }
  // else index object reference
  objRefs_[valueId] = objRefs_.size();
  // flag with instance, no traits, no externalizable
  writeU29(INSTANCE_NO_TRAITS_NO_EXTERNALIZABLE);
  if (value->HasRealNamedProperty(String::New("type"))) {
    writeUTF8(value->Get(String::New("type"))->ToString());
  } else {
    writeUTF8(String::New("Object")); 
  } 

  // write serializable properties
  Local<Array> propertyNames = value->GetPropertyNames();
  for (uint i = 0; i < propertyNames->Length(); i++) {
    Handle<String> propName = propertyNames->Get(i)->ToString();
    Local<Value> propValue = value->Get(propName);
    if (propValue->IsFunction()) {
      continue;
    }
    writeUTF8(propName);
    writeValue(propValue); 
  }
  writeUTF8(String::Empty());
}

void Serializer::writeDate(Handle<Object> date) {
  Local<Value> getTime = date->Get(String::New("getTime"));
  if (!getTime->IsFunction()) {
    die("Date doesn't have the getTime property?");
  }
  Local<Function> getTimeFn = Function::Cast(*getTime);
  Local<Value> dateDouble = getTimeFn->Call(date, 0, NULL);

  writeU8(AMF::AMF3_DATE);
  writeU29(1);
  writeDouble(dateDouble);
}

void Serializer::writeNumber(Handle<Value> value, bool writeMarker) {
  Local<Integer> integer = value->ToInteger();
  if (!integer->IsNull()) {
    int64_t val = integer->Value();
    // NOTE: writing large integers as doubles due to https://github.com/timwhitlock/node-amf/issues/10
    // original largest size was 0x20000000
    if (val == value->NumberValue() && val >= 0 && val < 0x00200000) {
      writeU29(val, writeMarker);
      return;
    }
  }
  writeDouble(value, writeMarker);
}

void Serializer::writeDouble(Handle<Value> value, bool writeMarker) {
  if (writeMarker) {
    writeU8(AMF::AMF3_DOUBLE);
  }
  double doubleValue = value->NumberValue();
  if (isnan(doubleValue)) {
    for (uint i = 0; i < sizeof(SERIALIZED_NaN); ++i) {
      writeU8(SERIALIZED_NaN[i]);
    }
    return;
  }
  // from amfast
  // https://code.google.com/p/amfast/source/browse/trunk/amfast/ext_src/encoder.c
  union aligned {
    double d_value;
    unsigned char c_value[8];
  } d_aligned;
  unsigned char *char_value = d_aligned.c_value;
  d_aligned.d_value = doubleValue;

  if (bigEndian) {
    for (int i = 0; i < 7; ++i) {
      writeU8(char_value[i]);
    }
  } else {
    for (int i = 7; i >= 0; --i) {
      writeU8(char_value[i]);
    }
  }
}

void Serializer::writeU8(unsigned char n) {
  buffer_.write(n);
}

void Serializer::writeU29(int64_t n, bool writeMarker) {
  std::vector<unsigned char> bytes;
  if (n < 0) {
    die("U29 range error - negative number");
  }
  if (n < 0x00200000) {
    bytes.push_back(n & 0x7F);
  } else {
    bytes.push_back(n & 0xFF);
    bytes.push_back(0x80 | ( (n>>=8) & 0x7F )); 
  }
  while (n >= 0x80) {
    bytes.push_back(0x80 | ( n>>=7 & 0x7F ));
  }
  if (writeMarker) {
    writeU8(AMF::AMF3_INTEGER);
  }
  for (int i = bytes.size() - 1; i >= 0; --i) {
    writeU8(bytes[i]);
  }
}

