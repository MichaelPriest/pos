export function inventoryCode(product){
  if(!product)return '';
  const stored=String(product.barcode||product.sku||'').trim().toUpperCase();
  if(stored)return stored;
  const id=String(product.id||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
  return id?`RV-${id.slice(0,10)}`:'';
}
