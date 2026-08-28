# Acme Corp — Multi-Factor Authentication Control

**Control ID:** MAC-001  
**Version:** 1.0  
**Effective Date:** 2024-01-01  
**Parent Policy:** ACP-001 (Access Control Policy)  
**Control Mapping:** IA-2(a), IA-2(b), IA-5

---

## 1. Purpose

This document specifies the technical implementation of multi-factor authentication (MFA) as required by the Access Control Policy (ACP-001) and Information Security Policy (ISP-001).

## 2. MFA Scope

### 2.1 Current Scope

MFA is currently enforced for:
- Privileged account access (administrator, root, database admin)
- VPN connections for IT Security team members only
- Cloud console access (AWS, Azure)

**Requirement:** MFA for privileged accounts only  
**Parent Clause:** ACP-001 Section 2.2  
**Responsible:** IT Security Team

### 2.2 Non-MFA Access

The following access types currently use single-factor authentication:
- Standard user VPN access
- Internal web application access
- Email access from corporate network

**Note:** These areas use password-only authentication and are pending MFA rollout.

## 3. MFA Factors

### 3.1 Accepted Second Factors

The following second factors are approved for use:
- Hardware security key (YubiKey 5 series) — Preferred
- Software authenticator (TOTP via Google Authenticator) — Approved
- Biometric (fingerprint, facial recognition) — Approved for device-local auth

**Requirement:** Approved second factors  
**Parent Clause:** ACP-001 Section 2.2  
**Control Mapping:** IA-2(b)  
**Responsible:** IT Security Team

### 3.2 Enrollment Process

Users must enroll MFA factors through the IT Security portal. Enrollment requires identity verification. Lost hardware tokens must be reported within 24 hours.

**Requirement:** MFA enrollment and lifecycle  
**Responsible:** IT Security Team

## 4. Token Management

### 4.1 Hardware Token Lifecycle

Hardware tokens are valid for 3 years. Tokens must be factory-reset before disposal. Lost/stolen tokens are revoked immediately.

**Requirement:** Hardware token lifecycle  
**Responsible:** IT Security Team

### 4.2 Backup Codes

Backup codes are generated during MFA enrollment. Codes are single-use and expire after 90 days.

**Requirement:** Backup code management  
**Responsible:** IT Security Team

## 5. Integration Points

### 5.1 VPN Integration

The Cisco AnyConnect VPN must be configured to enforce MFA for all connections. The MFA provider is integrated via RADIUS.

**Requirement:** VPN MFA integration  
**Parent Clause:** ACP-001 Section 5.1  
**Technical Implementation:** Cisco AnyConnect + Duo Security RADIUS  
**Responsible:** Network Team

### 5.2 Active Directory Integration

MFA is enforced at the AD level for privileged accounts using Windows Hello for Business or hardware tokens.

**Requirement:** AD-level MFA enforcement  
**Parent Clause:** ACP-001 Section 2.2  
**Technical Implementation:** Active Directory + Azure MFA  
**Responsible:** IT Operations
