{
  "targets": [
    {
      "target_name": "node_amf_cc",
      "sources": [ 
        "src/addon.cc", 
        "src/deserializer.cc",
        "src/read_buffer.cc",
        "src/serializer.cc",
        "src/write_buffer.cc", 
        "src/utils.cc",
      ],
      "include_dirs" : [
        "<!(node -e \"require('nan')\")"
      ],
    }
  ]
}
