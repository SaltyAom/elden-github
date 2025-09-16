const banners = {
	'assignmentUpdated': 'banners/assignment-updated.webp',
    codeReviewed: 'banners/code-reviewed.webp',
    commentEdited: 'banners/comment-edited.webp',
    issueClosed: 'banners/issue-closed.webp',
    issueCommented: 'banners/issue-commented.webp',
    issueCreated: 'banners/issue-created.webp',
    issueDuplicated: 'banners/issue-duplicated.webp',
    issueNotPlanned: 'banners/issue-not-planned.webp',
    issueReopened: 'banners/issue-reopened.webp',
    prCommented: 'banners/pull-request-commented.webp',
    prClosed: 'banners/pull-request-closed.webp',
    prMade: 'banners/pull-request-made.webp',
    prMerged: 'banners/pull-request-merged.webp',
    prReopened: 'banners/pull-request-reopened.webp',
    repoCreated: 'banners/repository-created.webp',
    repoDeleted: 'banners/repository-deleted.webp',
    repoStarred: 'banners/repository-starred.webp',
    repoUnstarred: 'banners/repository-unstarred.webp',
    requestedChange: 'banners/requested-change.webp'
} as const

export type Actions = keyof typeof banners

const sounds = {
    newItem: 'sounds/new-item.mp3',
    enemyFailed: 'sounds/enemy-failed.mp3'
} as const

const bannerSounds = {
	assignmentUpdated: 'newItem',
    codeReviewed: 'newItem',
    commentEdited: 'newItem',
    issueClosed: 'enemyFailed',
    issueCommented: 'newItem',
    issueCreated: 'enemyFailed',
    issueDuplicated: 'enemyFailed',
    issueNotPlanned: 'enemyFailed',
    issueReopened: 'newItem',
    prCommented: 'newItem',
    prClosed: 'enemyFailed',
    prMade: 'newItem',
    prMerged: 'newItem',
    prReopened: 'newItem',
    repoCreated: 'newItem',
    repoDeleted: 'enemyFailed',
    repoStarred: 'newItem',
    repoUnstarred: 'enemyFailed',
    requestedChange: 'enemyFailed'
} as const satisfies { [image in Actions]: keyof typeof sounds }

const animations = {
    duration: 1000,
    span: 3500,
    easings: {
        easeOutQuart: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }
} as const

const delays = {
    prMerged: 3000,
    repoCreated: 3000,
    prMade: 0,
    repoDeleted: 0
} as const satisfies Partial<{ [delay in Actions]: number }>

// Receive messages from background script
let port: chrome.runtime.Port | null = null
function connectPort() {
    port = chrome.runtime.connect()
    port.onDisconnect.addListener(() => {
        port = null
    })

    port.onMessage.addListener((message?: { action?: Actions }) => {
        if (!message?.action) return
        show(message.action)
    })
}
window.addEventListener('pageshow', (e) => {
    // Re-establish the connection if page is restored from bfcache
    // https://developer.chrome.com/blog/bfcache-extension-messaging-changes
    if (e.persisted && !port) {
        connectPort()
    }
})
window.addEventListener('pagehide', (e) => {
    // Destroy the port when page is put into bfcache
    if (e.persisted && port) {
        port.disconnect()
    }
})
// Initial connection
connectPort()

function show(
    action: Actions,
    delay = delays[action as keyof typeof delays] ?? 1000
) {
    if (action in banners === false) return

    const banner = document.createElement('img')
    banner.src = chrome.runtime.getURL(banners[action])
    banner.style.position = 'fixed'
    banner.style.top = '0px'
    banner.style.right = '0px'
    banner.style.zIndex = '9999'
    banner.style.width = '100%'
    banner.style.height = '100vh'
    banner.style.objectFit = 'cover'
    banner.style.objectPosition = 'center'
    banner.style.opacity = '1'
    banner.style.pointerEvents = 'none'

    const audio = new Audio(chrome.runtime.getURL(sounds[bannerSounds[action]]))
    audio.volume = 0.25

    setTimeout(() => {
        requestIdleCallback(() => {
            document.body.appendChild(banner)

            banner.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: animations.duration,
                easing: animations.easings.easeOutQuart,
                fill: 'forwards'
            })

            audio.play().catch(() => {})
        })
    }, delay)

    setTimeout(() => {
        banner.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: animations.duration,
            easing: animations.easings.easeOutQuart,
            fill: 'forwards'
        })

        setTimeout(() => {
            banner.remove()
        }, animations.duration + delay)
    }, animations.span + delay)
}
