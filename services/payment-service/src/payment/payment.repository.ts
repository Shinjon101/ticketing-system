import { db, type Tx } from "@/db";
import { eq } from "@ticketing/db";
import { payments, Payment, NewPayment } from "./payment.table";

export const paymentRepository = {
  findByOrderId: async (
    razorpayOrderId: string,
  ): Promise<Payment | undefined> => {
    const result = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, razorpayOrderId))
      .limit(1);
    return result[0];
  },

  createWithTx: async (tx: Tx, data: NewPayment): Promise<Payment> => {
    const [payment] = await tx.insert(payments).values(data).returning();
    return payment!;
  },

  markCapturedWithTx: async (
    tx: Tx,
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ): Promise<void> => {
    await tx
      .update(payments)
      .set({
        status: "captured",
        razorpayPaymentId,
        razorpaySignature,
        updatedAt: new Date(),
      })
      .where(eq(payments.razorpayOrderId, razorpayOrderId));
  },
};
