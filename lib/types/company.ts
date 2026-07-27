export type CompanyRecord = {
  id: number;
  code: string;
  name: string;
  invoicePrefix: string;
  address: string | null;
  phone: string | null;
  regNo: string | null;
  active: boolean;
  footerMessage: string | null;
  warrantyLine: string | null;
  logoUrl: string | null;
};
