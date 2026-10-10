const express=require('express');
const {many,one,transaction}=require('../database');
const {requireAuth,requireRole}=require('../middleware');
const {parseMarkupPercent,calculateWeightedAverageCost,calculateMarkupPriceCents}=require('../pricing');
const router=express.Router(); router.use(requireAuth);
router.get('/movements',async(req,res,next)=>{try{const limit=Math.min(Math.max(parseInt(req.query.limit,10)||100,1),300);res.json({movements:await many(`SELECT sm.*,p.name AS product_name,p.sku,u.name AS user_name FROM stock_movements sm JOIN products p ON p.id=sm.product_id LEFT JOIN users u ON u.id=sm.user_id ORDER BY sm.id DESC LIMIT $1`,[limit])});}catch(e){next(e);}});
router.post('/receipts',requireRole('admin','owner'),async(req,res,next)=>{try{
  const code=String(req.body?.code||'').trim();
  const quantity=Number(req.body?.quantity);
  const unitCostCents=Number(req.body?.unitCostCents);
  const supplier=String(req.body?.supplier||'').trim()||null;
  const invoiceNumber=String(req.body?.invoiceNumber||'').trim()||null;
  if(!code)return res.status(400).json({error:'Escaneie ou informe o código de barras/SKU.'});
  if(!Number.isSafeInteger(quantity)||quantity<1)return res.status(400).json({error:'A quantidade recebida deve ser um inteiro positivo.'});
  if(!Number.isSafeInteger(unitCostCents)||unitCostCents<1)return res.status(400).json({error:'Informe o custo unitário da compra maior que zero.'});
  if(supplier?.length>160||invoiceNumber?.length>100)return res.status(400).json({error:'Fornecedor ou nota fiscal excede o limite de caracteres.'});

  const result=await transaction(async client=>{
    const match=(await client.query(`SELECT id FROM products WHERE active=TRUE AND (barcode=$1 OR lower(sku)=lower($1)) ORDER BY (barcode=$1) DESC LIMIT 1`,[code])).rows[0];
    if(!match)return {error:'not_found'};
    const product=(await client.query('SELECT * FROM products WHERE id=$1 AND active=TRUE FOR UPDATE',[match.id])).rows[0];
    if(!product||!(product.barcode===code||String(product.sku||'').toLowerCase()===code.toLowerCase()))return {error:'not_found'};

    const markupPercent=parseMarkupPercent(req.body?.markupPercent===undefined?product.markup_percent:req.body.markupPercent);
    const costs=calculateWeightedAverageCost({
      currentQuantity:product.stock_quantity,
      currentCostCents:product.cost_cents,
      receivedQuantity:quantity,
      unitCostCents
    });
    const suggestedPriceCents=calculateMarkupPriceCents(costs.averageCostCents,markupPercent);
    const salePriceBeforeCents=product.price_cents;
    const salePriceAfterCents=req.body?.applySalePrice===true?suggestedPriceCents:salePriceBeforeCents;
    const updated=(await client.query(`UPDATE products SET stock_quantity=$1,cost_cents=$2,markup_percent=$3,price_cents=$4,updated_at=now() WHERE id=$5 RETURNING *`,[
      costs.totalQuantity,costs.averageCostCents,markupPercent,salePriceAfterCents,product.id
    ])).rows[0];
    const movement=(await client.query(`INSERT INTO stock_movements(
      product_id,type,quantity,reason,user_id,unit_cost_cents,total_cost_cents,
      average_cost_before_cents,average_cost_after_cents,markup_percent_applied,
      sale_price_before_cents,sale_price_after_cents,supplier,invoice_number
    ) VALUES($1,'purchase',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,[
      product.id,quantity,`Entrada por código ${code}`,req.session.user.id,unitCostCents,
      costs.entryTotalCostCents,product.cost_cents,costs.averageCostCents,markupPercent,
      salePriceBeforeCents,salePriceAfterCents,supplier,invoiceNumber
    ])).rows[0];
    movement.total_cost_cents=costs.entryTotalCostCents;
    return {product:updated,movement,suggestedPriceCents};
  });

  if(result.error==='not_found')return res.status(404).json({error:'Nenhum produto ativo foi encontrado para este código.'});
  res.status(201).json(result);
}catch(e){if(e.status)return res.status(e.status).json({error:e.message});next(e);}});
router.get('/summary',requireRole('admin','owner'),async(req,res,next)=>{try{res.json({summary:await one(`SELECT COUNT(*)::int AS products_count,COALESCE(SUM(stock_quantity),0)::int AS total_units,COALESCE(SUM(stock_quantity::bigint*cost_cents),0)::bigint AS inventory_cost_cents,COUNT(*) FILTER(WHERE stock_quantity<=minimum_stock)::int AS low_stock_count FROM products WHERE active=TRUE`)});}catch(e){next(e);}});
module.exports=router;
