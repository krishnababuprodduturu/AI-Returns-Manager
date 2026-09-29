import type { InspectionResult, Product, ReturnRecord, ScenarioKey, Evidence } from '../types'
export const products: Product[] = [
  { sku: 'WH-1000XM5', name: 'Sony WH-1000XM5 Wireless Headphones', category: 'Audio', components: ['Headphones', 'Carrying Case', 'USB Cable', 'Audio Cable', 'User Manual'] },
  { sku: 'WH-1000XM4', name: 'Sony WH-1000XM4 Wireless Headphones', category: 'Audio', components: ['Headphones', 'Carrying Case', 'USB Cable', 'Audio Cable', 'User Manual'] },
  { sku: 'KB-MX-KEYS', name: 'Logitech MX Keys Keyboard', category: 'Peripherals', components: ['Keyboard', 'USB Receiver', 'USB Cable', 'User Manual'] }]
const ev = (text: string, n: number): Evidence => ({ text, imageId: `image-${n}`, source: `Returned Image #${n}` })
const now = () => new Date().toISOString()
export const scenarios: Record<ScenarioKey, { label: string; result: InspectionResult }> = {
  correct: {
    label: 'Correct Product', result: {
      timestamp: now(),
      identity: { status: 'PASS', expected: 'Sony WH-1000XM5', detected: 'Sony WH-1000XM5', confidence: .96, reason: 'Returned product visually matches the expected product.', evidence: [ev('Model number WH-1000XM5 visible on product', 2), ev('Branding visible', 1)] },
      completeness: { status: 'PASS', missing: [], confidence: .93, reason: 'All expected components are visible in the accessory photographs.', evidence: [ev('Case, USB cable, audio cable and manual visible', 4)] },
      condition: { label: 'New', confidence: .9, reason: 'No visible marks or wear.', evidence: [ev('No visible signs of use', 1)] },
      disposition: { recommendation: 'RESTOCK', confidence: .92, reason: 'Product is complete, matches catalogue and shows no visible wear.' }
    }
  },
  wrong: {
    label: 'Wrong Product', result: {
      timestamp: now(),
      identity: { status: 'FAIL', expected: 'Sony WH-1000XM5', detected: 'Sony WH-1000XM4', confidence: .89, reason: 'Model marking differs from the expected product.', evidence: [ev('Model marking reads WH-1000XM4', 2)] },
      completeness: { status: 'UNCERTAIN', missing: [], confidence: .4, reason: 'Completeness cannot be judged against the expected SKU because the product does not match.', evidence: [] },
      condition: { label: 'Used - Good', confidence: .84, reason: 'Minor visible signs of use.', evidence: [ev('Minor visible signs of use', 1)] },
      disposition: { recommendation: 'UNCERTAIN', confidence: .55, reason: 'Wrong product returned. Manual review needed to decide next steps.' }
    }
  },
  missing: {
    label: 'Missing Accessory', result: {
      timestamp: now(),
      identity: { status: 'PASS', expected: 'Sony WH-1000XM5', detected: 'Sony WH-1000XM5', confidence: .96, reason: 'Returned product visually matches the expected product.', evidence: [ev('Model number WH-1000XM5 visible on product', 2)] },
      completeness: { status: 'FAIL', missing: ['USB Cable'], confidence: .88, reason: 'Accessory photograph shows the full layout and no USB cable is present.', evidence: [ev('USB cable not visible in accessory layout showing all other items', 4)] },
      condition: { label: 'Used - Good', confidence: .91, reason: 'Minor signs of use, no major damage visible.', evidence: [ev('Minor visible signs of use', 1), ev('No major physical damage visible', 3)] },
      disposition: { recommendation: 'REFURBISH', confidence: .9, reason: 'USB cable is missing. Product otherwise appears usable and the accessory can be replaced.' }
    }
  },
  damaged: {
    label: 'Damaged Product', result: {
      timestamp: now(),
      identity: { status: 'PASS', expected: 'Sony WH-1000XM5', detected: 'Sony WH-1000XM5', confidence: .94, reason: 'Product matches catalogue.', evidence: [ev('Branding visible', 1)] },
      completeness: { status: 'PASS', missing: [], confidence: .9, reason: 'All expected components visible.', evidence: [ev('All accessories visible', 4)] },
      condition: { label: 'Damaged', confidence: .93, reason: 'Cracked ear cup visible.', evidence: [ev('Crack visible on left ear cup', 3)] },
      disposition: { recommendation: 'DISPOSE', confidence: .8, reason: 'Visible structural damage; repair not indicated by the evidence provided.' }
    }
  },
  uncertain: {
    label: 'Uncertain Case', result: {
      timestamp: now(),
      identity: { status: 'UNCERTAIN', expected: 'Sony WH-1000XM5', detected: 'Unclear', confidence: .42, reason: 'Photographs do not clearly show the product model number.', evidence: [ev('Model marking is out of frame or blurred', 2)] },
      completeness: { status: 'UNCERTAIN', missing: [], confidence: .45, reason: 'Accessory photograph does not show the complete contents of the package.', evidence: [ev('Accessory photo is partly cropped', 4)] },
      condition: { label: 'UNCERTAIN', confidence: .38, reason: 'Lighting and image quality are insufficient to determine whether the visible marks are scratches.', evidence: [ev('Marks visible but low light', 1)] },
      disposition: { recommendation: 'UNCERTAIN', confidence: .4, reason: 'Evidence is insufficient for a recommendation. Retake photographs or send to manual review.' }
    }
  }
}
const ids: [string, string, ReturnRecord['state'], ReturnRecord['identity'], ReturnRecord['completeness'], string, ReturnRecord['disposition'], number][] = [
  ['RET-1041', 'ORD-8812', 'Completed', 'PASS', 'FAIL', 'Used - Good', 'REFURBISH', .9], ['RET-1042', 'ORD-8830', 'Completed', 'PASS', 'PASS', 'New', 'RESTOCK', .92],
  ['RET-1043', 'ORD-8841', 'Manual Review', 'UNCERTAIN', 'UNCERTAIN', 'UNCERTAIN', 'UNCERTAIN', .4], ['RET-1044', 'ORD-8852', 'Completed', 'FAIL', 'UNCERTAIN', 'Used - Good', 'UNCERTAIN', .55],
  ['RET-1045', 'ORD-8860', 'Completed', 'PASS', 'PASS', 'Damaged', 'DISPOSE', .8], ['RET-1046', 'ORD-8871', 'Pending', 'UNCERTAIN', 'UNCERTAIN', 'UNCERTAIN', 'UNCERTAIN', 0],
  ['RET-1047', 'ORD-8879', 'Processing', 'UNCERTAIN', 'UNCERTAIN', 'UNCERTAIN', 'UNCERTAIN', 0], ['RET-1048', 'ORD-8890', 'Completed', 'PASS', 'PASS', 'Used - Fair', 'LIQUIDATE', .86]]
export const returns: ReturnRecord[] = ids.map((r, i) => {
  const p = products[i % 3]
  return { id: '', return_number: r[0], orderId: r[1], sku: p.sku, product: p.name, received: new Date(Date.now() - i * 864e5).toISOString(), state: r[2], identity: r[3], completeness: r[4], condition: r[5], disposition: r[6], confidence: r[7] }
})
export const trend = Array.from({ length: 14 }, (_, i) => ({ day: `D-${13 - i}`, inspections: 18 + ((i * 7) % 15) }))
