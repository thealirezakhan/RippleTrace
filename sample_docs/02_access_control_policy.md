# Acme Corp — Access Control Policy

**Policy ID:** ACP-001  
**Version:** 1.0  
**Effective Date:** 2024-01-01  
**Parent Policy:** ISP-001 (Information Security Policy)  
**Derived From:** NIST SP 800-53 AC-2, AC-7, AC-17

---

## 1. Purpose

This policy defines access control requirements derived from the Information Security Policy (ISP-001). It governs how users authenticate, how sessions are managed, and how access is enforced across all Acme Corp systems.

## 2. Authentication Method Requirements

### 2.1 Standard User Access

Standard users accessing systems remotely must authenticate using corporate credentials. The authentication system validates username and password against the Active Directory.

**Requirement:** Username + password authentication  
**Parent Clause:** ISP-001 Section 2.1  
**Control Mapping:** AC-17(g)  
**Technical Implementation:** Active Directory + VPN  
**Responsible:** IT Operations

### 2.2 Privileged Access

Administrative and privileged access requires multi-factor authentication. The second factor must be a hardware token (YubiKey) or biometric verification.

**Requirement:** Multi-factor for privileged accounts  
**Parent Clause:** ISP-001 Section 2.2  
**Control Mapping:** IA-2(a)  
**Technical Implementation:** Active Directory + YubiKey  
**Responsible:** IT Security Team

## 3. Session Management

### 3.1 Session Timeout

User sessions must terminate after 5 minutes of inactivity. Administrators may extend sessions with justification.

**Requirement:** 5-minute session timeout  
**Parent Clause:** ISP-001 Section 4.1  
**Control Mapping:** AC-11(a)  
**Technical Implementation:** OS-level screen lock  
**Responsible:** IT Operations

### 3.2 Concurrent Sessions

Users are limited to 3 concurrent sessions. Concurrent session monitoring is enabled.

**Requirement:** Session limit and monitoring  
**Parent Clause:** ISP-001 Section 5.2  
**Control Mapping:** AC-17(f)  
**Technical Implementation:** Session manager  
**Responsible:** IT Operations

## 4. Account Lockout

Accounts are locked after 5 consecutive failed login attempts for a duration of 15 minutes. Lockout events are logged and monitored.

**Requirement:** Account lockout after 5 attempts, 15-minute lockout  
**Parent Clause:** ISP-001 Section 3.2  
**Control Mapping:** AC-7(a), AC-7(b)  
**Technical Implementation:** Active Directory Group Policy  
**Responsible:** IT Operations

## 5. VPN Requirements

All remote access must route through the corporate VPN. VPN connections must support encryption at TLS 1.2 or higher. Split tunneling is prohibited.

**Requirement:** VPN with TLS 1.2+ encryption  
**Parent Clause:** ISP-001 Section 5.1  
**Control Mapping:** AC-17(e), AC-17(d)  
**Technical Implementation:** Cisco AnyConnect VPN  
**Responsible:** Network Team
