// Jest test case
// Mock API call to return dummy flight data
test('Flight search component renders correctly', () => {
  const mockFlights = [{...}];
  render(<FlightSearch />);
  expect(screen.getByText(/search flights/i)).toBeInTheDocument();
});