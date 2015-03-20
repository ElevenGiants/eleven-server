#define BUILDING_NODE_EXTENSION 1
#include <nan.h>
#include "write_buffer.h"

WriteBuffer::WriteBuffer() {
}

WriteBuffer::~WriteBuffer() {
}

v8::Handle<v8::String> WriteBuffer::toString() const {
  return NanNew<v8::String>(bytes_.data(), bytes_.size());
}

void WriteBuffer::clear() {
  bytes_.clear();
}

void WriteBuffer::write(unsigned char ch) {
  bytes_.push_back(ch);
}

