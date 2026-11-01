# MCP settings on the Web Host

```json
{
  "settingsWritable": true,
  "initial": {
    "servers": []
  },
  "savedDisabled": {
    "enabled": false,
    "transport": "stdio",
    "smartTreeMemory": "read-only",
    "env": {},
    "headers": {},
    "secrets": [
      {
        "path": [
          "servers",
          "local",
          "env",
          "MCP_FIXTURE_SECRET"
        ],
        "set": true
      },
      {
        "path": [
          "servers",
          "local",
          "headers",
          "Authorization"
        ],
        "set": true
      }
    ]
  },
  "disabled": {
    "servers": [
      {
        "name": "local",
        "state": "disabled",
        "toolCount": 0
      }
    ]
  },
  "discovery": {
    "toolCount": 1,
    "tools": [
      "memory"
    ]
  },
  "afterDiscovery": {
    "servers": [
      {
        "name": "local",
        "state": "disabled",
        "toolCount": 0
      }
    ]
  },
  "savedEnabled": {
    "enabled": true,
    "transport": "stdio",
    "smartTreeMemory": "read-only",
    "env": {},
    "headers": {},
    "secrets": [
      {
        "path": [
          "servers",
          "local",
          "env",
          "MCP_FIXTURE_SECRET"
        ],
        "set": true
      },
      {
        "path": [
          "servers",
          "local",
          "headers",
          "Authorization"
        ],
        "set": true
      }
    ]
  },
  "connected": {
    "servers": [
      {
        "name": "local",
        "state": "connected",
        "toolCount": 1
      }
    ]
  },
  "registeredTool": {
    "name": "mcp__local__memory",
    "parameters": {
      "type": "object",
      "properties": {
        "operation": {
          "type": "string",
          "enum": [
            "find"
          ]
        },
        "keywords": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "context": {
          "type": "string"
        },
        "anchor_type": {
          "type": "string"
        }
      },
      "required": [
        "operation",
        "keywords"
      ]
    }
  },
  "refusedAnchor": {
    "isError": true,
    "content": [
      {
        "type": "text",
        "text": "Error: Smart Tree memory is read-only: only operation \"find\" is permitted."
      }
    ],
    "wireCalls": []
  },
  "allowedFind": {
    "isError": false,
    "content": [
      {
        "type": "text",
        "text": "find"
      }
    ],
    "wireCalls": [
      "memory:find"
    ]
  },
  "disabledAgain": {
    "servers": [
      {
        "name": "local",
        "state": "disabled",
        "toolCount": 0
      }
    ]
  },
  "toolRemoved": true,
  "credentialsPersistedWithoutReturningValues": true
}
```
