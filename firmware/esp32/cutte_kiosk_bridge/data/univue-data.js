'use strict';

(function initializeUnivueData(global) {
  const config = global.UNIVUE_CONFIG;
  const factory = global.supabase?.createClient;
  const client = config && factory
    ? factory(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
    : null;

  function assertReady() {
    if (!client) throw new Error('SUPABASE_UNAVAILABLE');
  }

  function unwrap(result) {
    if (result.error) {
      const error = new Error(result.error.message || result.error.code || 'DATABASE_ERROR');
      error.code = result.error.code;
      error.details = result.error.details;
      error.hint = result.error.hint;
      throw error;
    }
    return result.data;
  }

  async function getProducts() {
    assertReady();
    return unwrap(await client.from('products').select('*').eq('active', true).order('name'));
  }

  async function inventoryOverview(productCode) {
    assertReady();
    return unwrap(await client.rpc('inventory_overview', { p_product_code: productCode }));
  }

  async function checkInventory(productCode, size) {
    assertReady();
    const startedAt = performance.now();
    const checkedRows = unwrap(await client.rpc('check_inventory', {
      p_product_code: productCode,
      p_size: size
    }));
    const responseMs = Math.max(0, Math.round(performance.now() - startedAt));
    if (!Array.isArray(checkedRows) || !checkedRows[0] || checkedRows[0].quantity === null) throw new Error('STOCK_NOT_FOUND');
    client.rpc('record_inquiry', {
      p_kiosk_code: config.kioskCode,
      p_product_code: productCode,
      p_size: size,
      p_response_ms: responseMs
    }).then(() => {}, () => {});
    return {
      item: checkedRows[0].product_code,
      size: checkedRows[0].size,
      quantity: checkedRows[0].quantity,
      status: checkedRows[0].status
    };
  }

  async function placeOrder(order) {
    assertReady();
    return unwrap(await client.rpc('place_order', {
      p_kiosk_code: config.kioskCode,
      p_customer: {
        customerName: order.customerName,
        studentId: order.studentId,
        collegeDepartment: order.collegeDepartment,
        contactNumber: order.contactNumber
      },
      p_items: order.items.map(({ item, size, quantity }) => ({ item, size, quantity })),
      p_fulfillment: order.fulfillment,
      p_payment_method: order.paymentMethod,
      p_notes: order.notes || ''
    }));
  }

  async function requestAssistance(context = {}) {
    assertReady();
    return unwrap(await client.rpc('request_assistance', {
      p_kiosk_code: config.kioskCode,
      p_product_code: context.item || null,
      p_size: context.size || null,
      p_order_reference: context.orderReference || null,
      p_message: context.message || 'Student requested staff assistance.'
    }));
  }

  async function assistanceStatus(requestId, accessToken) {
    assertReady();
    return unwrap(await client.rpc('assistance_status', {
      p_request_id: requestId,
      p_access_token: accessToken
    }));
  }

  async function getSession() {
    assertReady();
    return unwrap(await client.auth.getSession()).session;
  }

  async function signIn(email, password) {
    assertReady();
    return unwrap(await client.auth.signInWithPassword({ email, password }));
  }

  async function signOut() {
    assertReady();
    return unwrap(await client.auth.signOut());
  }

  async function getStaffProfile() {
    assertReady();
    const session = await getSession();
    if (!session?.user) return null;
    const rows = unwrap(await client.from('staff_profiles').select('user_id, full_name, role, active').eq('user_id', session.user.id).limit(1));
    return rows?.[0] || null;
  }

  async function getStaffSnapshot() {
    assertReady();
    const [assistance, orders, inventory, products] = await Promise.all([
      client.from('assistance_requests').select('id,status,requested_at,acknowledged_at,resolved_at,message,product_code,size,order_reference,kiosks(code,display_name,location)').order('requested_at', { ascending: false }).limit(50),
      client.from('orders').select('id,reference,customer_name,student_id,fulfillment,payment_method,total,status,created_at,payments(id,status,provider_reference,confirmed_at),order_items(product_code,size,quantity,unit_price)').order('created_at', { ascending: false }).limit(50),
      client.from('inventory').select('product_code,size,quantity,updated_at').order('product_code').order('size'),
      client.from('products').select('code,name,category,gender,price,image_path,active').order('name')
    ]);
    return {
      assistance: unwrap(assistance),
      orders: unwrap(orders),
      inventory: unwrap(inventory),
      products: unwrap(products)
    };
  }

  async function updateAssistance(id, status) {
    assertReady();
    const timestamp = new Date().toISOString();
    const patch = { status };
    if (status === 'ACKNOWLEDGED') patch.acknowledged_at = timestamp;
    if (status === 'RESOLVED') patch.resolved_at = timestamp;
    return unwrap(await client.from('assistance_requests').update(patch).eq('id', id).select().single());
  }

  async function updateInventory(productCode, size, quantity) {
    assertReady();
    const session = await getSession();
    return unwrap(await client.from('inventory').update({
      quantity,
      updated_at: new Date().toISOString(),
      updated_by: session?.user?.id || null
    }).eq('product_code', productCode).eq('size', size).select().single());
  }

  async function updateOrderStatus(id, status) {
    assertReady();
    return unwrap(await client.rpc('staff_set_order_status', { p_order_id: id, p_status: status }));
  }

  async function confirmPayment(order) {
    assertReady();
    return unwrap(await client.rpc('staff_confirm_payment', {
      p_order_id: order.id,
      p_provider_reference: null
    }));
  }

  async function printReceipt(order, receiptNumber, products = []) {
    const baseUrl = config.hardwareBaseUrl;
    if (!baseUrl) return { configured: false, printed: false };
    const response = await fetch(`${baseUrl}/hardware/print-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: receiptNumber,
        total: Number(order.total),
        items: (order.order_items || []).map((line) => ({
          name: products.find((product) => product.code === line.product_code)?.name || line.product_code.replaceAll('_', ' '),
          size: line.size,
          quantity: line.quantity
        }))
      })
    });
    if (!response.ok) throw new Error('RECEIPT_PRINTER_UNAVAILABLE');
    return { configured: true, ...(await response.json()) };
  }

  function subscribeStaff(onChange) {
    assertReady();
    const channel = client.channel('univue-staff-live');
    for (const table of ['assistance_requests', 'orders', 'payments', 'inventory']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => onChange(table, payload));
    }
    channel.subscribe();
    return () => client.removeChannel(channel);
  }

  global.UNIVUE_DATA = Object.freeze({
    client,
    isReady: () => Boolean(client),
    config,
    getProducts,
    inventoryOverview,
    checkInventory,
    placeOrder,
    requestAssistance,
    assistanceStatus,
    getSession,
    signIn,
    signOut,
    getStaffProfile,
    getStaffSnapshot,
    updateAssistance,
    updateInventory,
    updateOrderStatus,
    confirmPayment,
    printReceipt,
    subscribeStaff
  });
})(window);
