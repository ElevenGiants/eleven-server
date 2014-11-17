#ifndef DESERIALIZER_H
#define DESERIALIZER_H

#include <node.h>
#include <stdint.h>
#include <memory>
#include "read_buffer.h"

class Deserializer : public node::ObjectWrap {
 public:
  static void Init(v8::Handle<v8::Object> exports);
  ~Deserializer();

 private:
  struct ObjRef {
    ObjRef();
    ReadBuffer::Region region;
    int32_t attr;
  };

  struct Traits {
    Traits();
    bool dynamic;
    std::vector<v8::Handle<v8::String> > props;
  };

  Deserializer();

  static v8::Handle<v8::Value> Run(const v8::Arguments& args);

  void init(v8::Handle<v8::String> payload);

  v8::Handle<v8::Value> readValue(ReadBuffer::Region* region);
  v8::Handle<v8::Value> readDate(ReadBuffer::Region* region);
  v8::Handle<v8::Array> readArray(ReadBuffer::Region* region);
  v8::Handle<v8::Number> readDouble(ReadBuffer::Region* region);
  v8::Handle<v8::String> readUTF8(ReadBuffer::Region* region);
  v8::Handle<v8::Object> readObject(ReadBuffer::Region* region);
  v8::Handle<v8::Integer> readInteger(ReadBuffer::Region* region);

  v8::Handle<v8::Array> readArrayWithLength(ReadBuffer::Region* region,
      int32_t len);
  v8::Handle<v8::Object> readObjectWithFlag(ReadBuffer::Region* region,
      int32_t n);
  v8::Handle<v8::Object> readObjectFromRegion(ReadBuffer::Region* region);
  v8::Handle<v8::Object> readObjectFromRegionAndTraits(
      ReadBuffer::Region* region, const Traits& traits);
  void readObjectDynamicProps(ReadBuffer::Region* region,
      v8::Handle<v8::Object> o);

  ObjRef makeRef(ReadBuffer::Region region, int32_t attr);

  std::auto_ptr<ReadBuffer> buffer_;
  std::vector<ReadBuffer::Region> strRefs_;
  std::vector<ObjRef> objRefs_;
  std::vector<Traits> traitRefs_;
};

#endif  // DESERIALIZER_H
