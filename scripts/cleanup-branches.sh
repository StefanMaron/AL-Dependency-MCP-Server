#!/bin/bash

# AL MCP Server - Branch Cleanup Script
# Manages branch cleanup and repository maintenance

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_CACHE_PATH="${REPO_CACHE_PATH:-/app/repo-cache}"
INDEX_CACHE_PATH="${INDEX_CACHE_PATH:-/app/index-cache}"
MAX_BRANCHES="${MAX_BRANCHES:-10}"
MIN_BRANCH_AGE_DAYS="${MIN_BRANCH_AGE_DAYS:-7}"
DRY_RUN="${DRY_RUN:-false}"
PRESERVE_BRANCHES="${PRESERVE_BRANCHES:-main,master,w1-26,w1-25,w1-24}"

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

show_usage() {
    cat << EOF
AL MCP Server - Branch Cleanup Script

Usage: $0 [OPTIONS]

Options:
  -d, --dry-run           Show what would be deleted without actually deleting
  -m, --max-branches N    Maximum number of branches to keep (default: $MAX_BRANCHES)
  -a, --min-age DAYS      Minimum age in days before a branch can be deleted (default: $MIN_BRANCH_AGE_DAYS)
  -p, --preserve LIST     Comma-separated list of branches to always preserve (default: $PRESERVE_BRANCHES)
  -f, --force             Force cleanup even if it would delete recent branches
  -i, --interactive       Interactive mode - ask before deleting each branch
  -v, --verbose           Verbose output
  -h, --help             Show this help message

Environment Variables:
  REPO_CACHE_PATH         Path to repository cache (default: /app/repo-cache)
  INDEX_CACHE_PATH        Path to index cache (default: /app/index-cache)
  MAX_BRANCHES           Maximum branches to keep (default: 10)
  MIN_BRANCH_AGE_DAYS    Minimum branch age in days (default: 7)
  PRESERVE_BRANCHES      Branches to always preserve (default: main,master,w1-26,w1-25,w1-24)

Examples:
  $0 --dry-run                          # Show what would be cleaned up
  $0 --max-branches 5                   # Keep only 5 branches
  $0 --min-age 14 --force              # Delete branches older than 14 days
  $0 --preserve "main,develop" -i       # Preserve specific branches, interactive mode

EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -m|--max-branches)
                MAX_BRANCHES="$2"
                shift 2
                ;;
            -a|--min-age)
                MIN_BRANCH_AGE_DAYS="$2"
                shift 2
                ;;
            -p|--preserve)
                PRESERVE_BRANCHES="$2"
                shift 2
                ;;
            -f|--force)
                FORCE="true"
                shift
                ;;
            -i|--interactive)
                INTERACTIVE="true"
                shift
                ;;
            -v|--verbose)
                VERBOSE="true"
                shift
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

check_repository() {
    if [ ! -d "$REPO_CACHE_PATH" ]; then
        log_error "Repository cache path does not exist: $REPO_CACHE_PATH"
        exit 1
    fi
    
    if [ ! -d "$REPO_CACHE_PATH/.git" ]; then
        log_error "No git repository found in: $REPO_CACHE_PATH"
        exit 1
    fi
    
    cd "$REPO_CACHE_PATH"
    
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        log_error "Invalid git repository in: $REPO_CACHE_PATH"
        exit 1
    fi
    
    log_success "Repository validated"
}

get_branch_info() {
    local branch="$1"
    local last_commit_date
    local commit_hash
    local commit_message
    
    # Get last commit information
    last_commit_date=$(git log -1 --format="%ci" "$branch" 2>/dev/null || echo "unknown")
    commit_hash=$(git log -1 --format="%h" "$branch" 2>/dev/null || echo "unknown")
    commit_message=$(git log -1 --format="%s" "$branch" 2>/dev/null | head -c 50 || echo "unknown")
    
    echo "$last_commit_date|$commit_hash|$commit_message"
}

get_branch_age_days() {
    local branch="$1"
    local last_commit_date
    local commit_timestamp
    local current_timestamp
    local age_seconds
    local age_days
    
    last_commit_date=$(git log -1 --format="%ci" "$branch" 2>/dev/null || echo "")
    
    if [ -z "$last_commit_date" ]; then
        echo "999" # Very old if we can't determine
        return
    fi
    
    # Convert to timestamp
    commit_timestamp=$(date -d "$last_commit_date" +%s 2>/dev/null || echo "0")
    current_timestamp=$(date +%s)
    
    age_seconds=$((current_timestamp - commit_timestamp))
    age_days=$((age_seconds / 86400))
    
    echo "$age_days"
}

is_branch_preserved() {
    local branch="$1"
    IFS=',' read -ra PRESERVED <<< "$PRESERVE_BRANCHES"
    
    for preserved in "${PRESERVED[@]}"; do
        preserved=$(echo "$preserved" | xargs) # trim whitespace
        if [ "$branch" = "$preserved" ]; then
            return 0
        fi
    done
    
    return 1
}

list_branches() {
    log "Analyzing repository branches..."
    
    # Get all local branches (excluding HEAD)
    local branches=()
    while IFS= read -r branch; do
        branch=$(echo "$branch" | sed 's/^[* ] //' | xargs) # Remove markers and trim
        if [ "$branch" != "HEAD" ] && [ -n "$branch" ]; then
            branches+=("$branch")
        fi
    done < <(git branch 2>/dev/null || true)
    
    if [ ${#branches[@]} -eq 0 ]; then
        log_warning "No local branches found"
        return
    fi
    
    log "Found ${#branches[@]} local branches"
    
    # Analyze each branch
    echo
    printf "%-20s %-10s %-12s %-15s %s\n" "BRANCH" "AGE (DAYS)" "LAST COMMIT" "STATUS" "MESSAGE"
    printf "%-20s %-10s %-12s %-15s %s\n" "------" "----------" "-----------" "------" "-------"
    
    for branch in "${branches[@]}"; do
        local branch_info
        local age_days
        local status
        
        branch_info=$(get_branch_info "$branch")
        IFS='|' read -r last_commit_date commit_hash commit_message <<< "$branch_info"
        
        age_days=$(get_branch_age_days "$branch")
        
        # Determine status
        if is_branch_preserved "$branch"; then
            status="PRESERVED"
        elif [ "$age_days" -lt "$MIN_BRANCH_AGE_DAYS" ]; then
            status="TOO_RECENT"
        else
            status="CANDIDATE"
        fi
        
        printf "%-20s %-10s %-12s %-15s %s\n" \
            "${branch:0:19}" \
            "$age_days" \
            "$commit_hash" \
            "$status" \
            "${commit_message:0:30}"
    done
    
    echo
}

get_cleanup_candidates() {
    local candidates=()
    local branches=()
    
    # Get all local branches
    while IFS= read -r branch; do
        branch=$(echo "$branch" | sed 's/^[* ] //' | xargs)
        if [ "$branch" != "HEAD" ] && [ -n "$branch" ]; then
            branches+=("$branch")
        fi
    done < <(git branch 2>/dev/null || true)
    
    # Filter candidates
    for branch in "${branches[@]}"; do
        if is_branch_preserved "$branch"; then
            [ "${VERBOSE:-false}" = "true" ] && log "Preserving branch: $branch (in preserve list)"
            continue
        fi
        
        local age_days
        age_days=$(get_branch_age_days "$branch")
        
        if [ "$age_days" -lt "$MIN_BRANCH_AGE_DAYS" ] && [ "${FORCE:-false}" != "true" ]; then
            [ "${VERBOSE:-false}" = "true" ] && log "Skipping branch: $branch (too recent: $age_days days)"
            continue
        fi
        
        candidates+=("$branch")
    done
    
    # Sort candidates by age (oldest first)
    if [ ${#candidates[@]} -gt 0 ]; then
        printf '%s\n' "${candidates[@]}" | while read -r branch; do
            age_days=$(get_branch_age_days "$branch")
            echo "$age_days $branch"
        done | sort -n | cut -d' ' -f2-
    fi
}

confirm_deletion() {
    local branch="$1"
    local branch_info
    
    branch_info=$(get_branch_info "$branch")
    IFS='|' read -r last_commit_date commit_hash commit_message <<< "$branch_info"
    
    echo
    echo "Branch to delete: $branch"
    echo "  Last commit: $commit_hash - $commit_message"
    echo "  Date: $last_commit_date"
    echo "  Age: $(get_branch_age_days "$branch") days"
    echo
    
    read -p "Delete this branch? [y/N] " -n 1 -r
    echo
    
    [[ $REPLY =~ ^[Yy]$ ]]
}

delete_branch() {
    local branch="$1"
    
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would delete branch: $branch"
        return 0
    fi
    
    if [ "${INTERACTIVE:-false}" = "true" ]; then
        if ! confirm_deletion "$branch"; then
            log "Skipping branch: $branch"
            return 0
        fi
    fi
    
    log "Deleting branch: $branch"
    
    # Switch to a safe branch if we're on the branch to be deleted
    local current_branch
    current_branch=$(git branch --show-current 2>/dev/null || echo "")
    
    if [ "$current_branch" = "$branch" ]; then
        local safe_branch
        IFS=',' read -ra PRESERVED <<< "$PRESERVE_BRANCHES"
        safe_branch="${PRESERVED[0]}"
        
        if git show-ref --verify --quiet "refs/heads/$safe_branch"; then
            log "Switching to $safe_branch before deleting current branch"
            git checkout "$safe_branch" || {
                log_error "Failed to switch to safe branch: $safe_branch"
                return 1
            }
        else
            log_error "Cannot delete current branch $branch: no safe branch available"
            return 1
        fi
    fi
    
    # Delete the branch
    if git branch -D "$branch" 2>/dev/null; then
        log_success "Branch deleted: $branch"
        
        # Remove corresponding index file if it exists
        local index_file="$INDEX_CACHE_PATH/${branch}.index.json"
        if [ -f "$index_file" ]; then
            rm -f "$index_file"
            log "Removed index file: $index_file"
        fi
        
        return 0
    else
        log_error "Failed to delete branch: $branch"
        return 1
    fi
}

cleanup_branches() {
    log "Starting branch cleanup process..."
    
    # Get cleanup candidates
    local candidates
    candidates=$(get_cleanup_candidates)
    
    if [ -z "$candidates" ]; then
        log_success "No branches need cleanup"
        return 0
    fi
    
    # Convert to array
    local candidate_array=()
    while IFS= read -r branch; do
        candidate_array+=("$branch")
    done <<< "$candidates"
    
    local total_branches
    total_branches=$(git branch | wc -l)
    local branches_to_delete
    
    # Determine how many branches to delete
    if [ "$total_branches" -le "$MAX_BRANCHES" ]; then
        log "Current branch count ($total_branches) is within limit ($MAX_BRANCHES)"
        if [ "${FORCE:-false}" != "true" ]; then
            log_success "No cleanup needed"
            return 0
        fi
    fi
    
    branches_to_delete=$((total_branches - MAX_BRANCHES))
    if [ "$branches_to_delete" -le 0 ]; then
        branches_to_delete=${#candidate_array[@]}
    fi
    
    log "Will delete up to $branches_to_delete branches"
    
    # Delete branches
    local deleted_count=0
    for branch in "${candidate_array[@]}"; do
        if [ "$deleted_count" -ge "$branches_to_delete" ]; then
            break
        fi
        
        if delete_branch "$branch"; then
            ((deleted_count++))
        fi
    done
    
    if [ "$deleted_count" -gt 0 ]; then
        log_success "Deleted $deleted_count branches"
    fi
}

cleanup_git_objects() {
    if [ "$DRY_RUN" = "true" ]; then
        log "DRY RUN: Would run git garbage collection"
        return 0
    fi
    
    log "Running git garbage collection..."
    
    # Clean up unreachable objects
    git prune --expire=now
    
    # Garbage collect with aggressive optimization
    git gc --aggressive --prune=now
    
    log_success "Git garbage collection completed"
}

cleanup_index_files() {
    if [ ! -d "$INDEX_CACHE_PATH" ]; then
        return 0
    fi
    
    log "Cleaning up orphaned index files..."
    
    local cleaned_count=0
    
    # Find index files that don't have corresponding branches
    for index_file in "$INDEX_CACHE_PATH"/*.index.json; do
        if [ ! -f "$index_file" ]; then
            continue
        fi
        
        local branch_name
        branch_name=$(basename "$index_file" .index.json)
        
        if ! git show-ref --verify --quiet "refs/heads/$branch_name"; then
            if [ "$DRY_RUN" = "true" ]; then
                log "DRY RUN: Would remove orphaned index file: $index_file"
            else
                rm -f "$index_file"
                log "Removed orphaned index file: $index_file"
            fi
            ((cleaned_count++))
        fi
    done
    
    if [ "$cleaned_count" -gt 0 ]; then
        log_success "Cleaned up $cleaned_count orphaned index files"
    else
        log "No orphaned index files found"
    fi
}

show_summary() {
    echo
    log_success "Cleanup completed!"
    
    local total_branches
    local repo_size
    
    total_branches=$(git branch | wc -l)
    repo_size=$(du -sh "$REPO_CACHE_PATH" 2>/dev/null | cut -f1 || echo "unknown")
    
    echo
    echo "Repository Summary:"
    echo "  Total branches: $total_branches"
    echo "  Repository size: $repo_size"
    echo "  Cache path: $REPO_CACHE_PATH"
    echo
    
    if [ "${VERBOSE:-false}" = "true" ]; then
        echo "Current branches:"
        git branch --format='  %(refname:short) (%(committerdate:relative))'
        echo
    fi
}

main() {
    local original_args=("$@")
    
    # Parse command line arguments
    parse_arguments "$@"
    
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "DRY RUN MODE - No actual changes will be made"
        echo
    fi
    
    # Validate environment
    check_repository
    
    # Show current state
    list_branches
    
    # Perform cleanup
    cleanup_branches
    cleanup_git_objects
    cleanup_index_files
    
    # Show final summary
    show_summary
    
    if [ "$DRY_RUN" = "true" ]; then
        echo
        log "To perform actual cleanup, run without --dry-run:"
        log "  $0 ${original_args[*]/--dry-run/}"
    fi
}

# Handle script interruption
trap 'log_warning "Cleanup interrupted"; exit 130' INT TERM

# Run main function with all arguments
main "$@"