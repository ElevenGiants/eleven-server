#ifndef WRITE_BUFFER_H
#define WRITE_BUFFER_H

#include <node.h>
#include <stdint.h>
#include <vector>

/*
 * WriteBuffer object.
 *
 * Each "byte" is stored in a uint16_t because that's what the v8 string class
 * takes in its initializer; if I try to give it an array of char*s, it attempts
 * to UTF8 decode it, ruining the AMF format.
 */
class WriteBuffer {
 public:
  WriteBuffer();
  ~WriteBuffer();

  v8::Handle<v8::String> toString() const;

  void write(unsigned char ch);

  void clear();

 private:
  std::vector<uint16_t> bytes_;
}; 

#endif  // WRITE_BUFFER_H
