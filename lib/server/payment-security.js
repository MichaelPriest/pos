import crypto from 'node:crypto';

const paymentError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export function gatewayIdempotencyKey(orderId, provider) {
  if (!orderId || !provider) throw paymentError('Pedido ou provedor ausente.');
  return `reveste:${provider}:${orderId}`;
}

export function assertPaymentMatches(order, amount, currency, { amountInCents = false } = {}) {
  const numericAmount = Number(amount);
  const expectedCents = Math.round(Number(order?.total) * 100);
  const receivedCents = amountInCents ? Math.round(numericAmount) : Math.round(numericAmount * 100);
  if (!Number.isFinite(numericAmount) || !Number.isFinite(expectedCents) || receivedCents !== expectedCents) {
    throw paymentError('O valor informado pela operadora não corresponde ao total do pedido.', 409);
  }
  if (String(currency || '').toUpperCase() !== 'BRL') {
    throw paymentError('A moeda informada pela operadora não corresponde ao pedido.', 409);
  }
  return true;
}

export function verifyMercadoPagoSignature(signatureHeader, requestId, dataId, secret) {
  if (!signatureHeader || !requestId || !dataId || !secret) {
    throw paymentError('Assinatura Mercado Pago ausente.', 401);
  }
  const values = String(signatureHeader).split(',').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    result[key] = [...(result[key] || []), value];
    return result;
  }, {});
  const timestamp = values.ts?.[0];
  if (!timestamp || !/^\d+$/.test(timestamp)) throw paymentError('Assinatura Mercado Pago inválida.', 401);
  const expected = crypto.createHmac('sha256', secret)
    .update(`id:${dataId};request-id:${requestId};ts:${timestamp};`)
    .digest('hex');
  const valid = (values.v1 || []).some(signature => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  });
  if (!valid) throw paymentError('Assinatura Mercado Pago inválida.', 401);
  return true;
}
