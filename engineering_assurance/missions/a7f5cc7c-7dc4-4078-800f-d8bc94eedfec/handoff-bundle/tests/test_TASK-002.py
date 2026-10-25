def test_user_login_success():
    response = client.post('/auth/login', json={'username': 'testuser', 'password': 'password123'})
    assert response.status_code == 200
    token = response.json()
    assert isinstance(token, str)