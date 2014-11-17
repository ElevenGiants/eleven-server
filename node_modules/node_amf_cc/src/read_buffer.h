#ifndef READ_BUFFER_H
#define READ_BUFFER_H

#include <node.h>
#include <stdint.h>
#include <vector>

/*
 * A ReadBuffer maintains an array of bytes.
 * Scroll through it with a ReadBuffer::Region struct.
 */
class ReadBuffer {
 public:
  ReadBuffer(v8::Handle<v8::String> payload);
  ~ReadBuffer();

  // Structure representing a region of the buffer with start and end pointers.
  struct Region {
    // Makes a copy of the region.
    // If len is shorter than remainingLength(), copies a subset of the region.
    Region copy(int len = -1) const;

    // Returns number of bytes consumed
    int consumed() const;

    // Returns length of region remaining to consume
    int remainingLength() const;

    // Destructive functions (shrink region)
    bool readUInt8(uint8_t* output);
    bool readUInt16(uint16_t* output);
    bool readUInt32(uint32_t* output);
    bool readDouble(double* output);
    bool readInt29(int32_t* output);

    bool read(uint8_t** dest, int len);

   protected:
    bool big_endian_;
    uint8_t* start_;
    uint8_t* curr_;
    uint8_t* end_;
    friend class ReadBuffer;
  };

  Region* getRegion();

 private:
  std::vector<uint8_t> bytes_;
  Region region_;
}; 

typedef ReadBuffer::Region ReadRegion;


#endif  // READ_BUFFER_H
