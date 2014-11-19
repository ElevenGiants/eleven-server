#ifndef AMF_H
#define AMF_H

namespace AMF {

// AMF3 markers
static const int AMF3_UNDEFINED = 0;
static const int AMF3_NULL = 1;
static const int AMF3_FALSE = 2;
static const int AMF3_TRUE = 3;
static const int AMF3_INTEGER = 4;
static const int AMF3_DOUBLE = 5;
static const int AMF3_STRING = 6;
static const int AMF3_XML_DOC = 7;
static const int AMF3_DATE = 8;
static const int AMF3_ARRAY = 9;
static const int AMF3_OBJECT = 0x0A;
static const int AMF3_XML = 0x0B;
static const int AMF3_BYTE_ARRAY = 0x0C;

}  // end namespace AMF

#endif  // AMF_H
