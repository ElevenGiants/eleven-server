#ifndef SERIALIZER_H
#define SERIALIZER_H

#include <node.h>
#include <stdint.h>
#include "write_buffer.h"

#ifdef _MSC_VER
#include <hash_map>
#define hashmap stdext
#else
#include <ext/hash_map>
#define hashmap __gnu_cxx
#endif

class Serializer : public node::ObjectWrap {
 public:
  static void Init(v8::Handle<v8::Object> exports);
  ~Serializer();

 private:
  Serializer();

  static int bigEndian;

  static v8::Handle<v8::Value> Run(const v8::Arguments& args);

  void clear();

  void writeValue(v8::Handle<v8::Value> value);
  void writeUndefined();
  void writeNull();
  void writeBool(v8::Handle<v8::Boolean> value);
  void writeUTF8(v8::Handle<v8::String> value, bool writeMarker = false);
  void writeArray(v8::Handle<v8::Array> value);
  void writeObject(v8::Handle<v8::Object> value);
  void writeDate(v8::Handle<v8::Object> date);
  void writeNumber(v8::Handle<v8::Value>, bool writeMarker = false);
  void writeDouble(v8::Handle<v8::Value>, bool writeMarker = false);
  void writeU8(unsigned char n);
  void writeU29(int64_t n, bool writeMarker = false);

  WriteBuffer buffer_;
  hashmap::hash_map<int, int> objRefs_;
};

#endif  // SERIALIZER_H
