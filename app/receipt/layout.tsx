export default function ReceiptLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        @page { size: 80mm auto; margin: 0; }
        @media screen {
          #receipt-root { max-width: 80mm; margin: 20px auto; background: #fff; }
        }
        @media print {
          html, body { background: #fff !important; }
          body > * { display: none !important; }
          #receipt-root { display: block !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div id="receipt-root">{children}</div>
    </>
  );
}
