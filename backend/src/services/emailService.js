const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ── Configurar transporter ────────────────────────────────────
const createTransporter = () => {
  if (process.env.NODE_ENV === 'development' || !process.env.SMTP_HOST) {
    // En desarrollo usar Ethereal (correo de prueba que no envía realmente)
    logger.info('Email: usando modo desarrollo (ethereal/console)');
    return null; // Se usará sendmail simulado
  }

  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// ── Generar HTML de la OC ─────────────────────────────────────
const generarHTMLOrdenCompra = (oc) => {
  const partidasHTML = (oc.partidas || []).map((p, i) => `
    <tr style="background:${i%2===0?'#f9f9f9':'#ffffff'}">
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${p.numero_partida}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${p.descripcion}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${p.unidad_medida||''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">${parseFloat(p.cantidad_solicitada).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$${parseFloat(p.precio_unitario||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right"><strong>$${parseFloat(p.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</strong></td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Orden de Compra ${oc.folio}</title></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:800px;margin:0 auto;padding:20px">

  <!-- Encabezado -->
  <div style="background:#1F4E79;color:#fff;padding:24px 28px;border-radius:8px 8px 0 0">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h1 style="margin:0;font-size:22px;font-weight:700">ORDEN DE COMPRA</h1>
        <div style="font-size:28px;font-weight:800;margin-top:4px;color:#90CAF9">${oc.folio}</div>
      </div>
      <div style="text-align:right;font-size:13px;opacity:0.85">
        <div>Fecha: <strong>${new Date(oc.fecha_solicitud).toLocaleDateString('es-MX')}</strong></div>
        ${oc.fecha_necesidad ? `<div>Fecha requerida: <strong>${new Date(oc.fecha_necesidad).toLocaleDateString('es-MX')}</strong></div>` : ''}
        <div>Moneda: <strong>${oc.moneda}</strong></div>
      </div>
    </div>
  </div>

  <!-- Datos empresa y proveedor -->
  <div style="display:flex;gap:0;background:#f5f5f5;padding:18px 28px;border-left:4px solid #1F4E79;border-right:4px solid #1F4E79">
    <div style="flex:1">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">De</div>
      <strong style="font-size:14px">${oc.empresa_nombre || 'Empresa SA de CV'}</strong><br>
      <span style="font-size:12px;color:#555">${oc.empresa_rfc || ''}</span>
    </div>
    <div style="flex:1;padding-left:24px;border-left:1px solid #ddd">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Para</div>
      <strong style="font-size:14px">${oc.proveedor_nombre || ''}</strong><br>
      <span style="font-size:12px;color:#555">${oc.proveedor_email || ''}</span><br>
      ${oc.proveedor_rfc ? `<span style="font-size:12px;color:#555">RFC: ${oc.proveedor_rfc}</span>` : ''}
    </div>
  </div>

  ${oc.proyecto_folio ? `
  <div style="background:#EBF3FB;padding:10px 28px;border-left:4px solid #2E75B6;border-right:4px solid #2E75B6;font-size:13px">
    <strong>Proyecto:</strong> ${oc.proyecto_folio} — ${oc.proyecto_nombre || ''}
  </div>` : ''}

  <!-- Tabla de partidas -->
  <table style="width:100%;border-collapse:collapse;margin-top:0;border:4px solid #1F4E79;border-top:none">
    <thead>
      <tr style="background:#2E75B6;color:#fff">
        <th style="padding:10px 12px;text-align:left;font-size:12px">#</th>
        <th style="padding:10px 12px;text-align:left;font-size:12px">Descripción</th>
        <th style="padding:10px 12px;text-align:center;font-size:12px">Unidad</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px">Cantidad</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px">P. Unitario</th>
        <th style="padding:10px 12px;text-align:right;font-size:12px">Total</th>
      </tr>
    </thead>
    <tbody>${partidasHTML}</tbody>
    <tfoot>
      <tr><td colspan="5" style="padding:8px 12px;text-align:right;font-size:13px;border-top:2px solid #ddd">Subtotal</td>
          <td style="padding:8px 12px;text-align:right;border-top:2px solid #ddd">$${parseFloat(oc.subtotal||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>
      <tr><td colspan="5" style="padding:8px 12px;text-align:right;font-size:13px">IVA (16%)</td>
          <td style="padding:8px 12px;text-align:right">$${parseFloat(oc.iva||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td></tr>
      <tr style="background:#1F4E79;color:#fff">
        <td colspan="5" style="padding:12px;text-align:right;font-size:15px;font-weight:700">TOTAL ${oc.moneda}</td>
        <td style="padding:12px;text-align:right;font-size:18px;font-weight:800">$${parseFloat(oc.total||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Condiciones -->
  ${oc.condiciones_pago || oc.lugar_entrega || oc.notas ? `
  <div style="margin-top:20px;padding:16px;background:#f9f9f9;border-radius:6px;font-size:13px">
    ${oc.condiciones_pago ? `<div><strong>Condiciones de pago:</strong> ${oc.condiciones_pago}</div>` : ''}
    ${oc.lugar_entrega ? `<div style="margin-top:6px"><strong>Lugar de entrega:</strong> ${oc.lugar_entrega}</div>` : ''}
    ${oc.notas ? `<div style="margin-top:6px"><strong>Notas:</strong> ${oc.notas}</div>` : ''}
  </div>` : ''}

  <div style="margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:16px">
    Este documento es una orden de compra oficial. Favor de confirmar recepción respondiendo este correo.
  </div>
</body>
</html>`;
};

// ── Enviar OC por email ───────────────────────────────────────
const enviarOrdenCompra = async (oc) => {
  const transporter = createTransporter();

  const emailTo    = oc.email_enviado_a || oc.proveedor_email;
  const asunto     = `Orden de Compra ${oc.folio} — ${oc.empresa_nombre || 'Empresa'}`;
  const htmlBody   = generarHTMLOrdenCompra(oc);

  if (!transporter) {
    // Modo desarrollo: solo loguear
    logger.info('EMAIL SIMULADO (desarrollo):', {
      to: emailTo, subject: asunto,
      folio: oc.folio, partidas: oc.partidas?.length
    });
    return { messageId: `dev-${Date.now()}`, preview: 'Correo simulado en desarrollo' };
  }

  const info = await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'Sistema ERP'}" <${process.env.EMAIL_FROM}>`,
    to: emailTo,
    subject: asunto,
    html: htmlBody,
  });

  logger.info('Email OC enviado', { folio: oc.folio, to: emailTo, messageId: info.messageId });
  return info;
};

module.exports = { enviarOrdenCompra, generarHTMLOrdenCompra };
