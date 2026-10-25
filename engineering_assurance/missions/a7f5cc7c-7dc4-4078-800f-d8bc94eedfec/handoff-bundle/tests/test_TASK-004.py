def test_hotel_search_success():
    response = client.get('/hotels/search?destination=New York&checkInDate=2024-12-25&checkOutDate=2024-12-30')
    assert response.status_code == 200
    results = response.json()
    assert isinstance(results, list)