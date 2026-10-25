import { validateDatabasePhase } from '../server/dbValidator.js';

const reqs = { entities: ['Payment', 'Order'], tables: ['payments', 'orders'] };
const files = [
  { path: 'backend/app/db/models.py', content: `
class Base: pass
class Payment(Base):
    __tablename__ = 'payments'
    order_id = Column(Integer, ForeignKey('orders.id'))
    order = relationship('Order', back_populates='payment')
class Order(Base):
    __tablename__ = 'orders'
`, status: 'validated' }
];

const manifest = {
  project_requirements: { database: reqs },
  modules: [{ id: 'MOD-001', required_files: files }]
};

async function main() {
  const res = await validateDatabasePhase(
    [{ required_files: files }],
    manifest,
    '',
    async () => JSON.stringify({ isValid: true, semanticIssues: [] }),
    (ev, msg) => console.log('EVENT:', ev, msg)
  );
  console.log('Result isValid:', res.isValid);
  console.log('Result defects:', JSON.stringify(res.defects, null, 2));
}

main().catch(console.error);
