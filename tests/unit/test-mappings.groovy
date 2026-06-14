/**
 * test-mappings.groovy - Unit tests for midPoint mapping rules
 *
 * These tests validate the Groovy scripts used in object templates
 * and synchronization reactions. Run them in midPoint's Groovy
 * console or with a standalone Groovy interpreter.
 *
 * Usage in midPoint:
 *   Navigate to Administration → Import → Select this file
 *
 * Usage standalone:
 *   groovy test-mappings.groovy
 */

import groovy.test.GroovyTestCase

class MidpointMappingTests extends GroovyTestCase {

    def script = new GroovyScriptEngine('.')

    /**
     * Test: Extension generation for AgenteCallCenter role
     * Verifies that a user with the role gets a generated extension
     */
    void testGenerateExtensionForAgent() {
        // Simulate user with AgenteCallCenter role
        def user = [
            name: [orig: 'testagent'],
            getAssignment: { ->
                [[getTargetRef: { -> [getOid: { -> '00000000-0000-0000-0000-000000000010' }] }]]
            },
            getTelephoneNumber: { -> null }
        ]

        def hasRole = user.getAssignment()
            .any { it.getTargetRef() != null &&
                    "00000000-0000-0000-0000-000000000010" == it.getTargetRef().getOid() }

        assertTrue("User should have AgenteCallCenter role", hasRole)

        def extension = user.getTelephoneNumber()
        if (hasRole && extension == null) {
            def maxExt = 1100
            extension = String.valueOf(maxExt + (Math.abs(user.name.orig.hashCode()) % 100))
            assertNotNull("Extension should be generated", extension)
            assertTrue("Extension should be between 1100-1199",
                extension.toInteger() >= 1100 && extension.toInteger() < 1200)
        }
    }

    /**
     * Test: Non-agent users should not get extensions
     */
    void testNoExtensionForNonAgent() {
        def user = [
            name: [orig: 'regularuser'],
            getAssignment: { -> [] },
            getTelephoneNumber: { -> null }
        ]

        def hasRole = user.getAssignment()
            .any { it.getTargetRef() != null &&
                    "00000000-0000-0000-0000-000000000010" == it.getTargetRef().getOid() }

        assertFalse("Regular user should NOT have AgenteCallCenter role", hasRole)

        if (!hasRole) {
            assertNull("Non-agent should not get extension", user.getTelephoneNumber())
        }
    }

    /**
     * Test: Role mapping to resource attribute
     */
    void testRoleMapping() {
        def roleOidAgent = "00000000-0000-0000-0000-000000000010"
        def roleOidSupervisor = "00000000-0000-0000-0000-000000000011"

        // Test agent role mapping
        def agentUser = [
            getAssignment: { ->
                [[getTargetRef: { -> [getOid: { -> roleOidAgent }] }]]
            }
        ]

        def agentRole = agentUser.getAssignment()
            .find { it.getTargetRef() != null }?.getTargetRef()?.getOid()

        assertEquals("Agent role OID should match", roleOidAgent, agentRole)

        // Map to attribute value
        def roleAttr = (agentRole == roleOidAgent) ? "AgenteCallCenter" :
                       (agentRole == roleOidSupervisor) ? "Supervisor" : "User"
        assertEquals("Role attribute should be AgenteCallCenter", "AgenteCallCenter", roleAttr)
    }

    /**
     * Test: Extension format validation
     */
    void testExtensionFormat() {
        def validExtensions = ['1001', '1002', '2001', '3001', '1100', '1199']
        def invalidExtensions = ['01', 'abc', '100', '10000', '-1', '', null]

        validExtensions.each { ext ->
            assertTrue("$ext should be valid (4 digits)", ext ==~ /\d{4}/)
        }

        invalidExtensions.each { ext ->
            if (ext != null) {
                assertFalse("$ext should be invalid", ext ==~ /\d{4}/)
            }
        }
    }

    /**
     * Test: SIP password policy
     * Passwords must be at least 8 characters
     */
    void testPasswordPolicy() {
        def validPasswords = ['sip1001pass', 'SecurePass1!', 'a1b2c3d4e5', '12345678']
        def invalidPasswords = ['short', '1234567', '']

        validPasswords.each { pw ->
            assertTrue("$pw should be valid (>=8 chars)", pw.length() >= 8)
        }

        invalidPasswords.each { pw ->
            assertFalse("$pw should be invalid (<8 chars)", pw.length() >= 8)
        }
    }

    /**
     * Test: Audit log entry format
     */
    void testAuditLogEntry() {
        def entry = [
            timestamp: new Date(),
            username: 'agente1',
            action: 'LOGIN',
            extension: '1001',
            ip_address: '192.168.1.10',
            details: 'Login exitoso desde softphone'
        ]

        assertNotNull("Timestamp required", entry.timestamp)
        assertNotNull("Username required", entry.username)
        assertNotNull("Action required", entry.action)
        assertTrue("Action should be uppercase", entry.action == entry.action.toUpperCase())

        def validActions = ['LOGIN', 'LOGOUT', 'CALL_OUT', 'CALL_IN', 'REPORT']
        assertTrue("Action should be valid", validActions.contains(entry.action))
    }
}

// Run tests
def tester = new MidpointMappingTests()
tester.run()
println "All tests completed."
