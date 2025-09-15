import type { Actions } from './content'

function dispatch(
    action: Actions,
    details:
        | chrome.webRequest.OnBeforeRequestDetails
        | chrome.webRequest.OnCompletedDetails
) {
    const tabId = details.tabId
    if (typeof tabId !== 'number' || !tabId) return

    chrome.tabs.sendMessage(tabId, {
        action
    })
}

function partialShapeMatch(
    a: Record<string, unknown>,
    b: Record<string, unknown>
) {
    if (!a || !b) return false

    for (const k of Object.keys(a)) {
        if (!(k in b)) return false

        if (a[k] && typeof a[k] === 'string' && typeof b[k] === 'string') {
            if (a[k] !== b[k]) return false
        }

        if (typeof a[k] === 'object' && typeof b[k] === 'object')
            if (
                !partialShapeMatch(
                    a[k] as Record<string, unknown>,
                    b[k] as Record<string, unknown>
                )
            )
                return false
    }

    return true
}

function readBody(detail: chrome.webRequest.OnBeforeRequestDetails) {
    if (detail.method !== 'POST') return

    const bytes = detail.requestBody?.raw?.[0]?.bytes
    if (!bytes) return

    const decoder = new TextDecoder('utf-8')
    const jsonStr = decoder.decode(bytes)

    try {
        return JSON.parse(jsonStr)
    } catch {
        return jsonStr
    }
}

type MaybeArray<T> = T | T[]

function formDataPropertyArrayToLiteral(
    formDataObject: Record<string, chrome.webRequest.FormDataItem[]> | undefined
) {
    if (!formDataObject) return undefined

    const formData = {} as Record<
        string,
        MaybeArray<chrome.webRequest.FormDataItem>
    >

    for (const key of Object.keys(formDataObject)) {
        const body = formDataObject[key]

        if (body.length === 1) formData[key] = body[0]
        else formData[key] = body
    }

    return formData
}

const pending = {
    prMade: false,
    repoDeleted: false
}

chrome.webRequest.onBeforeRequest.addListener(
    (detail) => {
        const match = (url: string | RegExp, method = 'POST') =>
            detail.method === method &&
            (typeof url === 'string'
                ? detail.url === url
                : detail.url.match(url))

        async function graphql() {
            const body = await readBody(detail)

            function partOfGraphQL(expected: Record<string, unknown>) {
                if (typeof expected === 'string') return expected === body

                return partialShapeMatch({ variables: expected }, body)
            }

            if (
                partOfGraphQL({
                    input: {
                        title: '',
                        body: '',
                        repositoryId: ''
                    }
                })
            )
                dispatch('issueCreated', detail)
            else if (
                partOfGraphQL({
                    input: {
                        body: '',
                        subjectId: ''
                    }
                })
            )
                dispatch('issueCommented', detail)
            else if (
                partOfGraphQL({
                    newStateReason: 'COMPLETED'
                })
            )
                dispatch('issueClosed', detail)
            else if (
                partOfGraphQL({
                    newStateReason: 'NOT_PLANNED'
                })
            )
                dispatch('issueNotPlanned', detail)
            else if (
                partOfGraphQL({
                    newStateReason: 'DUPLICATE'
                })
            )
                dispatch('issueDuplicated', detail)
            else if (
                partOfGraphQL({
                    input: {
                        body: '',
                        bodyVersion: '',
                        id: ''
                    }
                })
            )
                dispatch('commentEdited', detail)
                else if (
                    partOfGraphQL({
                    input: {
                    assignableId: ''
                    }
                    })
                ) dispatch('assignmentUpdated', detail)
            else if (
                partOfGraphQL({
                    id: ''
                })
            )
                dispatch('issueReopened', detail)
        }

        async function modifyPullRequest() {
            const body = formDataPropertyArrayToLiteral(
                detail.requestBody?.formData
            )

            console.log(body)

            if (!body) return

            if (
                partialShapeMatch(
                    {
                        comment_and_close: '1'
                    },
                    body
                )
            )
                return void dispatch('prClosed', detail)

            if (
                partialShapeMatch(
                    {
                        comment_and_open: '1'
                    },
                    body
                )
            )
                return void dispatch('prReopened', detail)

            if (
                partialShapeMatch(
                    {
                        'comment[body]': ''
                    },
                    body
                )
            )
                return void dispatch('prCommented', detail)
        }

        async function mergePullRequest() {
            const body: Record<string, unknown> = await readBody(detail)

            if (!body && typeof body !== 'object') return

            if (
                partialShapeMatch(
                    {
                        mergeMethod: 'MERGE'
                    },
                    body
                )
            )
                dispatch('prMerged', detail)
        }

        if (match('https://github.com/_graphql')) return void graphql()
        if (
            match(
                /https:\/\/github.com\/.*?\/.*?\/pull\/\d+\/comment\?sticky=true/g
            )
        )
            return void modifyPullRequest()

        if (
            match(
                /https:\/\/github.com\/.*?\/.*?\/pull\/\d+\/page_data\/merge/g
            )
        )
            return void mergePullRequest()

        if (
            match(/https:\/\/github.com\/.*?\/.*?\/pull\/create/g) ||
            match(/https:\/\/github.com\/.*?\/.*?\/pull\/new/g)
        ) {
            pending.prMade = true
            return
        }

        if (match(/https:\/\/github.com\/.*?\/.*?\/settings\/delete/g)) {
            pending.repoDeleted = true
            return
        }

        return undefined
    },
    { urls: ['https://github.com/*'] },
    ['requestBody']
)

chrome.webRequest.onCompleted.addListener(
    (detail) => {
        const match = (url: string | RegExp, method = 'POST') =>
            detail.method === method &&
            (typeof url === 'string'
                ? detail.url === url
                : detail.url.match(url))

        if (match('https://github.com/repositories'))
            return void dispatch('repoCreated', detail)

        if (
            pending.prMade &&
            match(
                /https:\/\/github.com\/.*?\/.*?\/pull\/\d+\/suggested\-reviewers/g,
                'GET'
            )
        ) {
            pending.prMade = false
            return void dispatch('prMade', detail)
        }

        if (
            pending.repoDeleted &&
            // When any repo participant is load = returned to the repo list page
            match(
                /https:\/\/github.com\/.*?\/.*?\/graphs\/participation/g,
                'GET'
            )
        ) {
            pending.repoDeleted = false
            return void dispatch('repoDeleted', detail)
        }

        return undefined
    },
    { urls: ['https://github.com/*'] }
)
