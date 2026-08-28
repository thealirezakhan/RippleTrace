# NIST SP 800-53 Rev. 5 — Security and Privacy Controls (Excerpt)

**Source:** National Institute of Standards and Technology  
**Publication:** SP 800-53 Rev. 5  
**Status:** Public Domain (U.S. Government Publication)

---

## AC-2 Account Management

The organization manages information system accounts including establishing, activating, modifying, reviewing, disabling, and removing accounts. Account management procedures include:

(a) Identifying and selecting the following types of information system accounts to support organizational missions/business functions: individual, shared, group, system, application, and guest/anonymous accounts;

(b) Assigning account managers;

(c) Establishing conditions for group and role membership;

(d) Specifying authorized users of the information system, group and role assignments, group and role membership, and system/public access permissions and privileges;

(e) Requiring approvals by [Assignment: organization-defined personnel or roles] for requests to create information system accounts;

(f) Creating, enabling, modifying, disabling, and removing information system accounts in accordance with [Assignment: organization-defined criteria, procedures, or conditions];

(g) Reviewing information system accounts [Assignment: organization-defined frequency];

(h) Reviewing the usage of information system accounts [Assignment: organization-defined frequency];

(i) Removing unused accounts [Assignment: organization-defined frequency];

(j) Auditing the establishment, modification, or disabling of information system accounts.

## AC-7 Unsuccessful Logon Attempts

The organization:

(a) Enforces a limit of [Assignment: organization-defined number] consecutive invalid logon attempts by a user during a [Assignment: organization-defined time period]; and

(b) Automatically locks the account/node for up to [Assignment: organization-defined lockout duration] or until released by an administrator when the maximum number of unsuccessful attempts is reached.

## AC-11 Device Lock

The organization:

(a) Prevents further access by an individual initiating a session by [Assignment: organization-defined action] after [Assignment: organization-defined time period] of inactivity; and

(b) Retains locked session content until the user re-authenticates.

## AC-17 Remote Access

The organization:

(a) Establishes usage restrictions, implementation/connection guidance, and connection requirements for remote access to the information system;

(b) Monitors for unauthorized remote access to the information system;

(c) Authorizes remote access to the information system prior to such access, including [Assignment: organization-defined frequency];

(d) Encrypts remote access sessions by default using [Assignment: organization-defined encryption mechanisms];

(e) Routes all remote accesses through [Assignment: organization-defined managed access collection points];

(f) Authorizes the execution of privileged commands and remote access to security-relevant information via remote access only in [Assignment: organization-defined circumstances]; and

(g) Requires multi-factor authentication in connection with remote access.

## IA-2 Identification and Authentication

The information system uniquely identifies and authenticates users (or processes acting on behalf of users) prior to allowing access to the system. For privileged accounts, multi-factor authentication is required.

(a) Multi-factor authentication to the organization's intranet and the organization's external-facing web sites is required for all privileged and non-privileged accounts.

(b) Multi-factor authentication requires the use of at least two of the following: something you know, something you have, and something you are.

## IA-5 Authenticator Management

The organization manages information system authenticators by verifying that the password of an information system account or user is at least [Assignment: organization-defined minimum character length] characters long. Multi-factor authentication mechanisms include hardware tokens, software tokens, biometrics, and smart cards.

## CM-6 Configuration Settings

The organization:

(a) Establishes [Assignment: organization-defined configuration settings] for information technology products employed within the information system;

(b) Implements the configuration settings;

(c) Identifies, documents, and approves any deviations from established configuration settings; and

(d) Monitors and controls changes to the configuration settings in accordance with organizational policies and procedures.

## SI-4 System Monitoring

The organization monitors the information system to detect:

(a) Attacks and indicators of potential attacks in accordance with [Assignment: organization-defined monitoring objectives];

(b) Unauthorized local, network, and remote connections to the information system.

Monitoring includes real-time monitoring, periodic review of logs, and continuous monitoring of system integrity. Alerts must be generated within [Assignment: organization-defined time period] of detection.
