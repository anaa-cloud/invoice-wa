export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body;
    // Sesuaikan field ini dengan format webhook Midtrans / Mayar / Xendit
    const invoiceNumber = payload.order_id || payload.data?.extraData?.invoice_number;
    const isPaid = payload.transaction_status === 'settlement' || payload.status === 'PAID';

    if (!isPaid || !invoiceNumber) {
      return res.status(200).json({ message: 'Status belum lunas atau diabaikan' });
    }

    // 1. Update status menjadi PAID di Supabase via REST API
    const updateRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/invoices?invoice_number=eq.${invoiceNumber}`,
      {
        method: 'PATCH',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation'
        },
        body: JSON.stringify({ status: 'PAID' })
      }
    );

    const updatedData = await updateRes.json();
    const invoice = updatedData[0];

    // 2. Kirim bukti lunas otomatis ke WA klien via Fonnte (opsional jika token diisi)
    if (invoice && process.env.FONNTE_TOKEN) {
      await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: {
          Authorization: process.env.FONNTE_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: invoice.client_wa,
          message: `Terima kasih Kak *${invoice.client_name}*! Pembayaran untuk tagihan *${invoice.invoice_number}* sebesar *Rp${Number(invoice.total_amount).toLocaleString('id-ID')}* telah kami terima (LUNAS).`
        })
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
