const express=require('express');
const {many,one}=require('../database');
const {requireAuth,requireRole}=require('../middleware');
const router=express.Router(); router.use(requireAuth);
router.get('/movements',async(req,res,next)=>{try{const limit=Math.min(Math.max(parseInt(req.query.limit,10)||100,1),300);res.json({movements:await many(`SELECT sm.*,p.name AS product_name,p.sku,u.name AS user_name FROM stock_movements sm JOIN products p ON p.id=sm.product_id LEFT JOIN users u ON u.id=sm.user_id ORDER BY sm.id DESC LIMIT $1`,[limit])});}catch(e){next(e);}});
router.get('/summary',requireRole('admin','owner'),async(req,res,next)=>{try{res.json({summary:await one(`SELECT COUNT(*)::int AS products_count,COALESCE(SUM(stock_quantity),0)::int AS total_units,COALESCE(SUM(stock_quantity*cost_cents),0)::bigint AS inventory_cost_cents,COUNT(*) FILTER(WHERE stock_quantity<=minimum_stock)::int AS low_stock_count FROM products WHERE active=TRUE`)});}catch(e){next(e);}});
module.exports=router;
