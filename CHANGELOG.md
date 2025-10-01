# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.2.1] - 2025-10-01

### Changed
- docs: clarify AL MCP vs MS Docs MCP tool usage

## [2.2.0] - 2025-09-30

### Added
- consolidate MCP tools for token efficiency

## [2.1.4] - 2025-09-19

### Added
- comprehensive AL reference tracking with field-level analysis

## [2.1.3] - 2025-09-04

### Added
- add comprehensive regression prevention tests for Issue #9
- add guideline for issue mentions in commit messages

### Fixed
- Windows path compatibility in cross-platform path tests
- bulletproof macOS path resolution in tests with path.resolve()
- complete macOS symlink resolution in path tests
- resolve macOS symlink path compatibility in tests
- update path test to handle CI directory naming
- remove problematic subprocess test causing CI hangs
- resolve test failures on macOS due to path resolution (#9)
- resolve relative path resolution in VS Code settings (closes #9)

## [2.1.2] - 2025-09-03

### Added
- add badges for npm version, CI status, license, Node.js, .NET, and MCP compatibility to README
- update README with additional prerequisites and setup verification steps #8

### Fixed
- resolve race condition in concurrent AL installer test

## [2.1.1] - 2025-09-03

### Fixed
- remove automatic package discovery on startup to prevent filesystem scanning

## [2.1.0] - 2025-09-03

### Added
- add LLM guidance when AL packages not loaded
- add comprehensive automated tests for AL Language tools installation

### Fixed
- resolve ALInstaller concurrent installation test failure and hanging tests
- resolve hanging AL installer tests and ensure all tests pass

### Changed
- refactor: enhance README for clarity, update AI assistant configuration to use 'al-symbols-mcp'
- refactor: update README for clarity and structure, enhance quick start instructions
- claude improvements

## [2.0.5] - 2025-09-02

### Added
- add automated changelog system with dynamic previous releases
- auto-discover AL projects and filter to latest versions
- add support for non-namespace AL packages (legacy format)

## [2.0.4] - 2025-09-02

### Added
- Auto-discover AL project directories containing app.json + .app files
- Version filtering to always use only the most recent version of each package
- Support for non-namespace AL packages (legacy format compatibility)
- Enhanced project directory search alongside existing .alpackages discovery

### Fixed
- AL package NAVX header extraction issues preventing ZIP extraction
- PowerShell extraction compatibility with .app files requiring .zip extension
- Cross-platform ZIP extraction support for Windows systems

### Changed
- Improved package discovery to find 13+ AL projects in typical repository structure
- Enhanced parser to handle both modern (namespace) and legacy (root-level) AL package formats
- Better error handling and logging for package loading failures

## [2.0.3] - 2024-XX-XX

### Fixed
- System-wide disk scanning prevention with VS Code settings support
- Cross-platform ZIP extraction support for Windows

## [2.0.2] - 2024-XX-XX

### Fixed
- OS-specific AL CLI packages for installation

### Added
- Improved installation process for different operating systems

---

## Legend
- **Added** - New features
- **Changed** - Changes in existing functionality  
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Vulnerability fixes

[Unreleased]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/compare/v2.0.4...HEAD
[2.0.4]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/StefanMaron/AL-Dependency-MCP-Server/releases/tag/v2.0.2