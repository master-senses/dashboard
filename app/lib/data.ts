import { createClient } from '@supabase/supabase-js';
import { sql } from '@vercel/postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// export async function fetchRevenue() {
//   try {
//     // Artificially delay a response for demo purposes.
//     // Don't do this in production :)

//     // console.log('Fetching revenue data...');
//     // await new Promise((resolve) => setTimeout(resolve, 3000));

//     const data = await sql<Revenue>`SELECT * FROM revenue`;

//     // console.log('Data fetch completed after 3 seconds.');

//     return data.rows;
//   } catch (error) {
//     console.error('Database Error:', error);
//     throw new Error('Failed to fetch revenue data.');
//   }
// }

export async function fetchRevenue() {
  try {
    // console.log('Fetching revenue data...');
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const { data, error } = await supabase.from('revenue').select('*');
    if (error) throw error;
    // console.log(data);
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  }
}

export async function fetchLatestInvoices() {
  try {
    const { data, error } = await supabase
    .from('invoices')
    .select(`
      amount,
      id,
      customers(name, image_url, email)
    `)
    // .order('date', { ascending: true })
    .limit(5);

    console.log(error);
    console.log(data);
    if (!data) return [];

    const latestInvoices = data.map((invoice) => ({
      // ...invoice,
      id: invoice.id,
      name: invoice.customers.name,
      image_url: invoice.customers.image_url,
      email: invoice.customers.email,
      amount: formatCurrency(invoice.amount),
    }));
    console.log(latestInvoices);
    return latestInvoices;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch the latest invoices.');
  }
}

export async function fetchCardData() {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    // const invoiceCountPromise = sql`SELECT COUNT(*) FROM invoices`;
    // const customerCountPromise = sql`SELECT COUNT(*) FROM customers`;
    // const invoiceStatusPromise = sql`SELECT
    //      SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
    //      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
    //      FROM invoices`;

    const invoiceCountPromise = supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true });

    const customerCountPromise = supabase
      .from('customers') 
      .select('*', { count: 'exact', head: true });

    const invoiceStatusPromise = supabase
      .from('invoices')
      .select('status, amount')
      .then(({ data }) => ({
        rows: [{
          paid: data?.filter(inv => inv.status === 'paid')
                    .reduce((sum, inv) => sum + inv.amount, 0) || 0,
          pending: data?.filter(inv => inv.status === 'pending')
                    .reduce((sum, inv) => sum + inv.amount, 0) || 0
        }]
      }));

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0].count ?? '0');
    const numberOfCustomers = Number(data[1].count ?? '0');
    const totalPaidInvoices = formatCurrency(data[2].rows[0].paid ?? '0');
    const totalPendingInvoices = formatCurrency(data[2].rows[0].pending ?? '0');

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number,
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id,
        amount,
        date,
        status,
        customers (
          name,
          email,
          image_url
        )
      `)
      .ilike('customers.name', `%${query}%`)
      .or(`status.ilike.%${query}%`)
      // .order('date', { ascending: false })
      .range(offset, offset + ITEMS_PER_PAGE - 1);
    // console.log(data[1].customers.name);
    return data;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  }
}

export async function fetchInvoicesPages(query: string) {
  try {
    const count = await sql`SELECT COUNT(*)
    FROM invoices
    JOIN customers ON invoices.customer_id = customers.id
    WHERE
      customers.name ILIKE ${`%${query}%`} OR
      customers.email ILIKE ${`%${query}%`} OR
      invoices.amount::text ILIKE ${`%${query}%`} OR
      invoices.date::text ILIKE ${`%${query}%`} OR
      invoices.status ILIKE ${`%${query}%`}
  `;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  }
}

export async function fetchInvoiceById(id: string) {
  try {
    const data = await sql<InvoiceForm>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `;

    const invoice = data.rows.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
    }));

    return invoice[0];
  } catch (error) {
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  }
}

export async function fetchCustomers() {
  try {
    const data = await sql<CustomerField>`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `;

    const customers = data.rows;
    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch all customers.');
  }
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error('Database Error:', err);
    throw new Error('Failed to fetch customer table.');
  }
}
