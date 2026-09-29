const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const DEFAULT_MODEL = 'gpt-4o-mini'
const STATUS_VALUES = ['PASS', 'FAIL', 'UNCERTAIN']
const DISPOSITION_VALUES = ['RESTOCK', 'REFURBISH', 'LIQUIDATE', 'DISPOSE', 'UNCERTAIN']
const FINDING_TYPES = ['identity', 'completeness', 'condition', 'disposition']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const objectSchema = properties => ({
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties)
})

function imageSchema(imageIds) {
    return objectSchema({
        findingType: { type: 'string', enum: FINDING_TYPES },
        finding: { type: 'string' },
        evidenceText: { type: 'string' },
        imageId: { type: 'string', enum: imageIds },
        confidence: { type: 'number' }
    })
}

function responseSchema(conditionLabels, componentNames, imageIds) {
    const evidence = { type: 'array', items: imageSchema(imageIds) }
    return objectSchema({
        identity: objectSchema({
            status: { type: 'string', enum: STATUS_VALUES },
            expected: { type: 'string' },
            detected: { type: 'string' },
            confidence: { type: 'number' },
            reason: { type: 'string' }
        }),
        completeness: objectSchema({
            status: { type: 'string', enum: STATUS_VALUES },
            missing: { type: 'array', items: { type: 'string', enum: componentNames } },
            confidence: { type: 'number' },
            reason: { type: 'string' }
        }),
        condition: objectSchema({
            label: { type: 'string', enum: conditionLabels },
            confidence: { type: 'number' },
            reason: { type: 'string' }
        }),
        disposition: objectSchema({
            recommendation: { type: 'string', enum: DISPOSITION_VALUES },
            confidence: { type: 'number' },
            reason: { type: 'string' }
        }),
        overallConfidence: { type: 'number' },
        evidence
    })
}

function validateRequest(body) {
    const { returnInformation, expectedProduct, expectedComponents, conditionDefinitions, orderInformation, images } = body ?? {}
    if (!returnInformation || !expectedProduct || !orderInformation || !Array.isArray(expectedComponents) || !Array.isArray(conditionDefinitions) || !Array.isArray(images)) {
        return { status: 400, message: 'Request must include returnInformation, expectedProduct, expectedComponents, conditionDefinitions, orderInformation, and images.' }
    }
    if (!UUID_PATTERN.test(returnInformation.id ?? '') || !returnInformation.returnNumber || !returnInformation.orderNumber) {
        return { status: 400, message: 'returnInformation must include the return UUID, returnNumber, and orderNumber.' }
    }
    if (!expectedProduct.sku || !expectedProduct.name) {
        return { status: 404, message: 'Expected product was not found in the inspection request.' }
    }
    if (!orderInformation.orderNumber) {
        return { status: 404, message: 'Order information was not found in the inspection request.' }
    }
    if (expectedComponents.length === 0 || expectedComponents.some(component => !component?.name)) {
        return { status: 400, message: 'expectedComponents must contain named catalogue components.' }
    }
    if (conditionDefinitions.length === 0 || conditionDefinitions.some(definition => !definition?.label)) {
        return { status: 422, message: 'Official condition definitions are required before inspection.' }
    }
    if (images.length === 0 || images.length > 12 || images.some(image => !image?.imageId || !image?.imageUrl)) {
        return { status: 400, message: 'Provide between 1 and 12 uploaded images with imageId and imageUrl.' }
    }
    const invalidImage = images.find(image => {
        if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(image.imageUrl)) return false
        try { return new URL(image.imageUrl).protocol !== 'https:' } catch { return true }
    })
    if (invalidImage) return { status: 400, message: `Image ${invalidImage.fileName ?? invalidImage.imageId} must use a signed HTTPS URL or supported image data URL.` }
    return null
}

function validConfidence(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function normalizeResult(result, { expectedProduct, expectedComponents, conditionDefinitions, images, businessRules }) {
    const imageById = new Map(images.map(image => [image.imageId, image]))
    const componentNames = new Set(expectedComponents.filter(component => component.required !== false).map(component => component.name))
    const conditionLabels = new Set(conditionDefinitions.map(definition => definition.label))
    if (!result || !result.identity || !result.completeness || !result.condition || !result.disposition || !Array.isArray(result.evidence)) {
        throw new Error('The AI provider returned an incomplete inspection response.')
    }
    if (!STATUS_VALUES.includes(result.identity.status) || !STATUS_VALUES.includes(result.completeness.status) ||
        !DISPOSITION_VALUES.includes(result.disposition.recommendation) ||
        !(conditionLabels.has(result.condition.label) || result.condition.label === 'UNCERTAIN')) {
        throw new Error('The AI provider returned an invalid status, disposition, or condition label.')
    }
    if (![result.identity.confidence, result.completeness.confidence, result.condition.confidence,
    result.disposition.confidence, result.overallConfidence].every(validConfidence)) {
        throw new Error('The AI provider returned invalid confidence values.')
    }
    if (!Array.isArray(result.completeness.missing) || result.completeness.missing.some(name => !componentNames.has(name))) {
        throw new Error('The AI provider returned a missing component that was not in the expected catalogue list.')
    }
    const evidence = result.evidence.map(item => {
        if (!item || !FINDING_TYPES.includes(item.findingType) || !imageById.has(item.imageId) ||
            typeof item.finding !== 'string' || typeof item.evidenceText !== 'string' || !validConfidence(item.confidence)) {
            throw new Error('The AI provider returned evidence that does not reference a supplied image or finding type.')
        }
        return item
    })
    const evidenceFor = findingType => evidence.filter(item => item.findingType === findingType)
    const identityEvidence = evidenceFor('identity')
    const completenessEvidence = evidenceFor('completeness')
    const conditionEvidence = evidenceFor('condition')
    if (result.identity.status !== 'UNCERTAIN' && identityEvidence.length === 0) {
        throw new Error('The AI provider made an identity finding without image evidence.')
    }
    if (result.completeness.status !== 'UNCERTAIN' && completenessEvidence.length === 0) {
        throw new Error('The AI provider made a completeness finding without image evidence.')
    }
    if (result.condition.label !== 'UNCERTAIN' && conditionEvidence.length === 0) {
        throw new Error('The AI provider selected a condition without image evidence.')
    }

    const toFrontendEvidence = item => ({
        text: item.evidenceText,
        imageId: item.imageId,
        source: imageById.get(item.imageId).fileName || imageById.get(item.imageId).imageCategory || 'Uploaded image',
        findingType: item.findingType,
        finding: item.finding,
        evidenceText: item.evidenceText,
        confidence: item.confidence
    })
    const disposition = businessRules.length === 0
        ? { recommendation: 'UNCERTAIN', confidence: 0, reason: 'No disposition business rules were supplied; no disposition policy was inferred.' }
        : result.disposition
    if (disposition.recommendation !== 'UNCERTAIN' && evidenceFor('disposition').length === 0) {
        throw new Error('The AI provider made a disposition recommendation without image evidence.')
    }
    return {
        identity: {
            ...result.identity,
            expected: `${expectedProduct.name} (${expectedProduct.sku})`,
            evidence: identityEvidence.map(toFrontendEvidence)
        },
        completeness: { ...result.completeness, evidence: completenessEvidence.map(toFrontendEvidence) },
        condition: { ...result.condition, evidence: conditionEvidence.map(toFrontendEvidence) },
        disposition,
        overallConfidence: result.overallConfidence,
        evidence,
        timestamp: new Date().toISOString()
    }
}

function createPrompt(context) {
    const { returnInformation, expectedProduct, expectedComponents, conditionDefinitions, orderInformation, businessRules } = context
    return [
        'You are an evidence-grounded returned-product inspection system. Analyze the supplied photographs together with the explicit catalogue and order information.',
        'Use only visible photographic evidence or facts explicitly present in the supplied catalogue/order context. Never infer identity from an absent label, assume a component is missing because it is outside the frame, or invent facts, evidence, product rules, or condition labels.',
        'Identity and completeness must be PASS, FAIL, or UNCERTAIN. Use UNCERTAIN when images do not support a reliable conclusion. A FAIL for a missing component requires a sufficiently complete view of the returned set.',
        'For condition, choose exactly one supplied condition label, or UNCERTAIN when evidence is insufficient. Do not create or paraphrase condition labels.',
        'Recommend a disposition only by applying the supplied businessRules. If businessRules is empty, disposition must be UNCERTAIN. Allowed recommendations are RESTOCK, REFURBISH, LIQUIDATE, DISPOSE, and UNCERTAIN.',
        'Every evidence item must quote or describe a specific visible observation and use an imageId exactly as supplied. Do not create evidence from catalogue/order text; this response schema requires image-linked evidence.',
        'Return confidence values from 0 to 1. Make confidence low when the view is ambiguous. Keep each reason concise and state uncertainty explicitly.',
        JSON.stringify({ returnInformation, expectedProduct, expectedComponents, conditionDefinitions, orderInformation, businessRules, images: context.images.map(({ imageId, imageCategory, fileName }) => ({ imageId, imageCategory, fileName })) })
    ].join('\n\n')
}

export async function handleAIInspection(req, res) {
    const validation = validateRequest(req.body)
    if (validation) return res.status(validation.status).json({ error: validation.message })

    const apiKey = process.env.AI_API_KEY
    if (!apiKey) return res.status(500).json({ error: 'AI provider is not configured. Set AI_API_KEY in the Render service environment.' })

    const body = req.body
    const businessRules = Array.isArray(body.businessRules) ? body.businessRules.filter(rule => typeof rule === 'string') : []
    const context = { ...body, businessRules }
    const conditionLabels = [...new Set([...body.conditionDefinitions.map(definition => definition.label), 'UNCERTAIN'])]
    const componentNames = [...new Set(body.expectedComponents.map(component => component.name))]
    const imageIds = body.images.map(image => image.imageId)
    const content = [{ type: 'text', text: createPrompt(context) }, ...body.images.map(image => ({
        type: 'image_url', image_url: { url: image.imageUrl, detail: 'high' }
    }))]

    try {
        const response = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(90000),
            body: JSON.stringify({
                model: process.env.AI_MODEL || DEFAULT_MODEL,
                temperature: 0,
                response_format: {
                    type: 'json_schema',
                    json_schema: { name: 'returns_inspection', strict: true, schema: responseSchema(conditionLabels, componentNames, imageIds) }
                },
                messages: [{ role: 'user', content }]
            })
        })
        const providerResult = await response.json().catch(() => null)
        if (!response.ok) {
            console.error('AI provider request failed:', response.status, providerResult?.error?.message ?? response.statusText)
            return res.status(500).json({ error: 'AI inspection failed because the vision provider rejected the request.' })
        }
        const output = providerResult?.choices?.[0]?.message?.content
        if (typeof output !== 'string') return res.status(500).json({ error: 'AI provider returned no structured inspection result.' })
        let parsed
        try { parsed = JSON.parse(output) } catch { return res.status(500).json({ error: 'AI provider returned invalid JSON.' }) }
        try {
            return res.json(normalizeResult(parsed, { ...body, businessRules }))
        } catch (error) {
            console.error('AI inspection response validation failed:', error.message)
            return res.status(500).json({ error: 'AI provider returned an unsupported inspection result.' })
        }
    } catch (error) {
        console.error('AI provider request failed:', error.message)
        return res.status(500).json({ error: error.name === 'TimeoutError' ? 'AI inspection timed out. Please retry.' : 'AI inspection provider is unavailable.' })
    }
}