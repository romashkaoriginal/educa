---
layout: col-sidebar
title: Remediation Guide
tags: incident-response, remediation
level: 2
type: documentation
---

# Remediation Guide

This guide provides standard remediation actions after a skill-related incident.

## Immediate Actions

1. Remove or disable affected skills.
2. Revoke and rotate credentials.
3. Block known malicious IOCs.

## Verification Steps

- Confirm skill removal on all endpoints.
- Confirm revoked credentials are no longer active.
- Validate no further suspicious behavior appears in logs.

## Recovery Steps

- Restore trusted versions of affected skills.
- Re-enable services in phases.
- Monitor for recurrence.

## Hardening Follow-ups

- Tighten permission manifests.
- Add or tune behavioral scanner rules.
- Improve CI policy gates for skill submissions.
