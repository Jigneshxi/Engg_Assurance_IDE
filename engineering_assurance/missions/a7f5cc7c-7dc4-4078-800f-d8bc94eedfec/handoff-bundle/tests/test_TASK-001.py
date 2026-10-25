def test_user_registration_success():
    response = client.post('/users/register', json={'username': 'testuser', 'email': 'test@example.com', 'password': 'password123'})
    assert response.status_code == 201
    # Verify user exists in the database