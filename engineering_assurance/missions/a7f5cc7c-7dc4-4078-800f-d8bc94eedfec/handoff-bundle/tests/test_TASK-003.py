def test_flight_search_success():
    response = client.get('/flights/search?origin=JFK&destination=LAX&departureDate=2024-12-25')
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)