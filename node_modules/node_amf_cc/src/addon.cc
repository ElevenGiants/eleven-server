#include <node.h>
#include <v8.h>
#include "deserializer.h"
#include "serializer.h"

using namespace v8;

void Init(Handle<Object> exports) {
  Serializer::Init(exports);  
  Deserializer::Init(exports);  
}

NODE_MODULE(node_amf_cc, Init)
