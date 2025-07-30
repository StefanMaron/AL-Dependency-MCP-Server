#!/bin/bash

# AL MCP Server - Repository Initialization Script
# This script initializes the repository based on environment configuration

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REPO_TYPE="${REPO_TYPE:-bc-history-sandbox}"
REPO_URL="${REPO_URL:-https://github.com/StefanMaron/MSDyn365BC.Sandbox.Code.History.git}"
DEFAULT_BRANCHES="${DEFAULT_BRANCHES:-w1-26,w1-24}"
REPO_CACHE_PATH="${REPO_CACHE_PATH:-/app/repo-cache}"
MAX_BRANCHES="${MAX_BRANCHES:-10}"
AUTO_CLEANUP="${AUTO_CLEANUP:-true}"

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup_on_error() {
    log_error "Initialization failed. Cleaning up..."
    if [ -d "$REPO_CACHE_PATH" ]; then
        rm -rf "$REPO_CACHE_PATH"
        log "Removed repository cache directory"
    fi
    exit 1
}

# Set up error handling
trap cleanup_on_error ERR

check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v git &> /dev/null; then
        log_error "git is not installed"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "node is not installed"
        exit 1
    fi
    
    log_success "All dependencies are available"
}

create_directories() {
    log "Creating necessary directories..."
    
    mkdir -p "$REPO_CACHE_PATH"
    mkdir -p /app/index-cache
    mkdir -p /app/logs
    
    # Set proper permissions
    chmod 755 "$REPO_CACHE_PATH"
    chmod 755 /app/index-cache
    chmod 755 /app/logs
    
    log_success "Directories created successfully"
}

setup_git_config() {
    log "Setting up git configuration..."
    
    # Set git configuration for container
    git config --global user.name "AL MCP Server"
    git config --global user.email "al-mcp-server@container.local"
    git config --global init.defaultBranch main
    git config --global core.autocrlf false
    git config --global core.longpaths true
    
    # Optimize for repository operations
    git config --global pack.threads 0
    git config --global pack.deltaCacheSize 256m
    git config --global core.preloadIndex true
    git config --global core.fscache true
    
    log_success "Git configuration completed"
}

init_bc_history_sandbox_repo() {
    log "Initializing BC History Sandbox repository..."
    
    cd "$REPO_CACHE_PATH"
    
    if [ ! -d ".git" ]; then
        log "Cloning BC History Sandbox repository (this may take a while)..."
        
        # Use partial clone for space efficiency
        git clone --filter=blob:none --no-checkout "$REPO_URL" . || {
            log_error "Failed to clone repository"
            exit 1
        }
        
        log_success "Repository cloned successfully"
    else
        log "Repository already exists, fetching updates..."
        git fetch origin || {
            log_warning "Failed to fetch updates, continuing with existing repository"
        }
    fi
    
    # Add default branches
    IFS=',' read -ra BRANCHES <<< "$DEFAULT_BRANCHES"
    for branch in "${BRANCHES[@]}"; do
        branch=$(echo "$branch" | xargs) # trim whitespace
        
        log "Setting up branch: $branch"
        
        if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
            # Create or update local branch
            git branch -f "$branch" "origin/$branch" || {
                log_warning "Failed to create branch $branch"
                continue
            }
            
            log_success "Branch $branch ready"
        else
            log_warning "Branch $branch not found in remote repository"
        fi
    done
    
    # Checkout the first available branch
    for branch in "${BRANCHES[@]}"; do
        branch=$(echo "$branch" | xargs)
        if git show-ref --verify --quiet "refs/heads/$branch"; then
            git checkout "$branch"
            log_success "Checked out branch: $branch"
            break
        fi
    done
}

init_bc_fork_repo() {
    log "Initializing BC fork repository..."
    
    if [ -z "${REPO_URL:-}" ]; then
        log_error "REPO_URL must be specified for BC fork repositories"
        exit 1
    fi
    
    cd "$REPO_CACHE_PATH"
    
    # Handle authentication if token file is provided
    CLONE_URL="$REPO_URL"
    if [ -n "${AUTH_TOKEN_FILE:-}" ] && [ -f "$AUTH_TOKEN_FILE" ]; then
        log "Using authentication token for repository access"
        TOKEN=$(cat "$AUTH_TOKEN_FILE" | tr -d '\n\r')
        
        # Add token to URL (supports GitHub and Azure DevOps)
        if [[ "$REPO_URL" == *"github.com"* ]]; then
            CLONE_URL=$(echo "$REPO_URL" | sed "s|https://github.com|https://${TOKEN}@github.com|")
        elif [[ "$REPO_URL" == *"dev.azure.com"* ]]; then
            CLONE_URL=$(echo "$REPO_URL" | sed "s|https://dev.azure.com|https://${TOKEN}@dev.azure.com|")
        fi
    fi
    
    if [ ! -d ".git" ]; then
        log "Cloning BC fork repository..."
        git clone --filter=blob:none --no-checkout "$CLONE_URL" . || {
            log_error "Failed to clone repository"
            exit 1
        }
        log_success "Repository cloned successfully"
    else
        log "Repository already exists, fetching updates..."
        git fetch origin || {
            log_warning "Failed to fetch updates"
        }
    fi
    
    # Setup branches similar to BC History Sandbox
    init_bc_history_sandbox_repo
}

init_local_development() {
    log "Initializing local development setup..."
    
    if [ -z "${WORKSPACE_PATH:-}" ]; then
        log_error "WORKSPACE_PATH must be specified for local development"
        exit 1
    fi
    
    if [ ! -d "$WORKSPACE_PATH" ]; then
        log_error "Workspace path does not exist: $WORKSPACE_PATH"
        exit 1
    fi
    
    log "Setting up workspace monitoring for: $WORKSPACE_PATH"
    
    # Create symbolic link to workspace
    if [ ! -L "$REPO_CACHE_PATH/workspace" ]; then
        ln -s "$WORKSPACE_PATH" "$REPO_CACHE_PATH/workspace"
        log_success "Workspace linked successfully"
    fi
    
    # Link BC reference if provided
    if [ -n "${REFERENCE_PATH:-}" ] && [ -d "$REFERENCE_PATH" ]; then
        if [ ! -L "$REPO_CACHE_PATH/bc-reference" ]; then
            ln -s "$REFERENCE_PATH" "$REPO_CACHE_PATH/bc-reference"
            log_success "BC reference linked successfully"
        fi
    fi
}

init_al_extension() {
    log "Initializing AL extension repository..."
    
    cd "$REPO_CACHE_PATH"
    
    if [ ! -d ".git" ]; then
        if [ -n "${REPO_URL:-}" ]; then
            log "Cloning AL extension repository..."
            git clone "$REPO_URL" . || {
                log_error "Failed to clone repository"
                exit 1
            }
        else
            log "Creating empty repository for AL extension"
            git init
        fi
        log_success "Repository initialized successfully"
    else
        log "Repository already exists"
        if [ -n "${REPO_URL:-}" ]; then
            git fetch origin || {
                log_warning "Failed to fetch updates"
            }
        fi
    fi
}

setup_health_check() {
    log "Setting up health check endpoint..."
    
    # Create a simple health check script
    cat > /app/health-check.sh << 'EOF'
#!/bin/bash
# Simple health check for the AL MCP Server

check_git_repo() {
    if [ -d "$REPO_CACHE_PATH/.git" ]; then
        cd "$REPO_CACHE_PATH"
        if git rev-parse --git-dir > /dev/null 2>&1; then
            echo "Git repository: OK"
            return 0
        fi
    fi
    echo "Git repository: FAILED"
    return 1
}

check_node_process() {
    if pgrep -f "node.*server.js" > /dev/null; then
        echo "Node server: OK"
        return 0
    fi
    echo "Node server: FAILED"
    return 1
}

# Run checks
check_git_repo
check_node_process

# Return overall status
if check_git_repo && check_node_process; then
    echo "Overall status: HEALTHY"
    exit 0
else
    echo "Overall status: UNHEALTHY"
    exit 1
fi
EOF
    
    chmod +x /app/health-check.sh
    log_success "Health check endpoint created"
}

setup_cleanup_schedule() {
    if [ "$AUTO_CLEANUP" = "true" ]; then
        log "Setting up automatic cleanup schedule..."
        
        # Create cleanup script
        cat > /app/cleanup.sh << 'EOF'
#!/bin/bash
# Automatic cleanup script for AL MCP Server

REPO_CACHE_PATH="${REPO_CACHE_PATH:-/app/repo-cache}"
MAX_BRANCHES="${MAX_BRANCHES:-10}"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

if [ -d "$REPO_CACHE_PATH/.git" ]; then
    cd "$REPO_CACHE_PATH"
    
    # Count local branches (excluding HEAD and origin/*)
    BRANCH_COUNT=$(git branch | grep -v "HEAD\|origin/" | wc -l)
    
    if [ "$BRANCH_COUNT" -gt "$MAX_BRANCHES" ]; then
        log "Found $BRANCH_COUNT branches, cleaning up to $MAX_BRANCHES"
        
        # Get branches sorted by last commit date (oldest first)
        BRANCHES_TO_DELETE=$((BRANCH_COUNT - MAX_BRANCHES))
        git for-each-ref --format='%(refname:short) %(committerdate:unix)' refs/heads/ | \
        sort -k2 -n | head -n "$BRANCHES_TO_DELETE" | \
        while read branch timestamp; do
            log "Deleting old branch: $branch"
            git branch -D "$branch" 2>/dev/null || true
        done
        
        # Clean up git objects
        log "Running git garbage collection..."
        git gc --aggressive --prune=now
        
        log "Cleanup completed"
    else
        log "Branch count ($BRANCH_COUNT) is within limit ($MAX_BRANCHES)"
    fi
fi
EOF
        
        chmod +x /app/cleanup.sh
        log_success "Cleanup schedule configured"
    fi
}

print_summary() {
    log_success "Repository initialization completed!"
    echo
    echo "Configuration Summary:"
    echo "  Repository Type: $REPO_TYPE"
    echo "  Repository URL: ${REPO_URL:-'N/A'}"
    echo "  Cache Path: $REPO_CACHE_PATH"
    echo "  Default Branches: $DEFAULT_BRANCHES"
    echo "  Max Branches: $MAX_BRANCHES"
    echo "  Auto Cleanup: $AUTO_CLEANUP"
    echo
    
    if [ -d "$REPO_CACHE_PATH/.git" ]; then
        cd "$REPO_CACHE_PATH"
        echo "Repository Status:"
        echo "  Current Branch: $(git branch --show-current 2>/dev/null || echo 'None')"
        echo "  Total Branches: $(git branch | wc -l)"
        echo "  Last Commit: $(git log -1 --format='%h %s' 2>/dev/null || echo 'None')"
        echo
    fi
    
    echo "AL MCP Server is ready to start!"
}

main() {
    log "Starting AL MCP Server repository initialization..."
    log "Repository type: $REPO_TYPE"
    
    check_dependencies
    create_directories
    setup_git_config
    
    case "$REPO_TYPE" in
        "bc-history-sandbox")
            init_bc_history_sandbox_repo
            ;;
        "bc-fork")
            init_bc_fork_repo
            ;;
        "local-development")
            init_local_development
            ;;
        "al-extension")
            init_al_extension
            ;;
        *)
            log_error "Unknown repository type: $REPO_TYPE"
            log "Supported types: bc-history-sandbox, bc-fork, local-development, al-extension"
            exit 1
            ;;
    esac
    
    setup_health_check
    setup_cleanup_schedule
    print_summary
}

# Run main function
main "$@"