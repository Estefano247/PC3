# Unit Tests - midPoint Mappings

## test-mappings.groovy

Validates the Groovy scripts used in midPoint object templates:

| Test | Description |
|------|-------------|
| `testGenerateExtensionForAgent` | Verifies AgenteCallCenter users get auto-generated SIP extension (1100-1199) |
| `testNoExtensionForNonAgent` | Verifies non-agent users do NOT get extensions |
| `testRoleMapping` | Validates role OID to attribute name mapping |
| `testExtensionFormat` | Validates extension format (exactly 4 digits) |
| `testPasswordPolicy` | Validates password minimum length (8 chars) |
| `testAuditLogEntry` | Validates audit log entry format |

### How to run in midPoint

1. Import the Groovy script:
   - Login to midPoint: http://localhost:8080/midpoint
   - Navigate: Administration → Import
   - Select `test-mappings.groovy`
   - Click Import

2. Or run standalone:
```bash
groovy tests/unit/test-mappings.groovy
```

### Expected output
```
All tests completed.
```
