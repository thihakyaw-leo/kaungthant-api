import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../db/tenant';

const checkoutAPI = new Hono<{ Bindings: Env }>();

/**
 * PROCESS CHECKOUT
 * - Create Sale record
 * - Create Sale details
 * - Deduct Stock
 * - Log Transaction
 */
checkoutAPI.post('/process', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const { cart, paymentMethod, customerId, locationId, userId, totalAmount, taxAmount, payableAmount, paidAmount } = body;
  
  const now = Math.floor(Date.now() / 1000);
  const saleId = crypto.randomUUID();
  const invoiceNo = `INV-${Date.now()}`;

  try {
    // 1. Fetch Customer Discount if applicable
    let tierDiscountAmount = 0;
    let customerGroupId = null;

    if (customerId) {
      const customer = await db
        .select({ 
          group: schema.saleCustomerGroup,
          loyaltyPoints: schema.saleCustomer.loyaltyPoints
        })
        .from(schema.saleCustomer)
        .leftJoin(schema.saleCustomerGroup, eq(schema.saleCustomer.customerGroupId, schema.saleCustomerGroup.id))
        .where(eq(schema.saleCustomer.id, customerId))
        .get();

      if (customer?.group?.discountPercent) {
        tierDiscountAmount = (totalAmount * customer.group.discountPercent) / 100;
      }
    }

    const finalPayableAmount = totalAmount - tierDiscountAmount + taxAmount;

    // 2. Prepare Batch Operations
    const operations: any[] = [];

    // Create Sale Header
    operations.push(
      db.insert(schema.saleSale).values({
        id: saleId,
        invoiceNo,
        locationId,
        customerId,
        totalAmount,
        taxAmount,
        discountAmount: tierDiscountAmount, // Saving the tier discount
        payableAmount: finalPayableAmount,
        paidAmount,
        paymentMethod,
        statusId: 'completed',
        transactionDate: now,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      })
    );

    // Process each cart item
    for (const item of cart) {
      const detailId = crypto.randomUUID();
      const logId = crypto.randomUUID();

      // Save Detail
      operations.push(
        db.insert(schema.saleSaleDetail).values({
          id: detailId,
          saleId,
          stockId: item.id,
          quantity: item.qty,
          unitPrice: item.price,
          totalPrice: item.price * item.qty,
          createdAt: now,
          createdBy: userId
        })
      );

      // Deduct Stock
      operations.push(
        db.update(schema.inventoryStockQuantity)
          .set({ 
            quantity: sql`${schema.inventoryStockQuantity.quantity} - ${item.qty}`,
            updatedAt: now 
          })
          .where(and(
            eq(schema.inventoryStockQuantity.stockId, item.id),
            eq(schema.inventoryStockQuantity.locationId, locationId)
          ))
      );

      // Log Transaction
      operations.push(
        db.insert(schema.configTransactionLog).values({
          id: logId,
          stockId: item.id,
          locationId,
          transactionType: 'SALE',
          referenceId: invoiceNo,
          quantityChange: -item.qty,
          balanceAfter: 0,
          createdAt: now,
          createdBy: userId
        })
      );
    }

    // 3. Update Loyalty Points & Check for Tier Upgrade
    if (customerId) {
      const pointsEarned = Math.floor(finalPayableAmount / 1000);
      
      // Update Points
      operations.push(
        db.update(schema.saleCustomer)
          .set({ 
            loyaltyPoints: sql`${schema.saleCustomer.loyaltyPoints} + ${pointsEarned}`,
            updatedAt: now 
          })
          .where(eq(schema.saleCustomer.id, customerId))
      );

      // Tier Upgrade Logic (Auto-promote to Gold if points > 5000)
      // Note: In real production, this would fetch from saleCustomerGroup.minPoints
      operations.push(
        db.update(schema.saleCustomer)
          .set({ 
            customerGroupId: sql`CASE 
              WHEN loyalty_points + ${pointsEarned} >= 5000 THEN 'gold-tier-id'
              WHEN loyalty_points + ${pointsEarned} >= 2000 THEN 'silver-tier-id'
              ELSE customer_group_id END`
          })
          .where(eq(schema.saleCustomer.id, customerId))
      );
    }

    // Execute Batch
    await db.batch(operations as any);

    return c.json({ 
      success: true, 
      invoiceNo, 
      discountApplied: tierDiscountAmount,
      payableAmount: finalPayableAmount
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

export default checkoutAPI;