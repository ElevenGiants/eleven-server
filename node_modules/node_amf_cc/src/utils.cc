#define BUILDING_NODE_EXTENSION 1
#include <nan.h>
#include <node.h>
#include "utils.h"

using namespace v8;

bool isBigEndian() {
  const int endian_test = 1;
 return !!((*(char*)&endian_test) == 0);
}

