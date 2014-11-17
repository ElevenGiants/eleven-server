#define BUILDING_NODE_EXTENSION 1
#include "write_buffer.h"

WriteBuffer::WriteBuffer() {
}

WriteBuffer::~WriteBuffer() {
}

v8::Handle<v8::String> WriteBuffer::toString() const {
  return v8::String::New(bytes_.data(), bytes_.size());
}

void WriteBuffer::clear() {
  bytes_.clear();
}

void WriteBuffer::write(unsigned char ch) {
  bytes_.push_back(ch);
}

