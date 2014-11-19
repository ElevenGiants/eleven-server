#define BUILDING_NODE_EXTENSION 1
#include <node.h>
#include "utils.h"

using namespace v8;

void die(const char* msg) {
  ThrowException(Exception::TypeError(String::New(msg)));
}

bool isBigEndian() {
  const int endian_test = 1;
 return !!((*(char*)&endian_test) == 0);
}

