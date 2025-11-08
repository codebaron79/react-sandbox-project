import { useState, useEffect } from "react";
import { Table, Spin, Alert } from "antd";
import { callAPI } from "@/api/apiService";
import { API_CONFIG } from "@/api/apiConfig";

interface User {
  id: number;
  name: string;
  username: string;
  email: string;
}

interface Post {
  userId: number;
  id: number;
  title: string;
  body: string;
}

function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [loadingPosts, setLoadingPosts] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserData = () => {
    setLoadingUsers(true);
    setError(null);
    callAPI<User[]>(API_CONFIG.USERS.LIST)
      .then((data) => setUsers(data))
      .catch(() => setError("Không tải được danh sách user"))
      .finally(() => setLoadingUsers(false));
  };

  const fetchPostData = () => {
    setLoadingPosts(true);
    setError(null);
    callAPI<Post[]>(API_CONFIG.POSTS.LIST)
      .then((data) => setPosts(data))
      .catch(() => setError("Không tải được danh sách post"))
      .finally(() => setLoadingPosts(false));
  };

  useEffect(() => {
    fetchUserData();
    fetchPostData();
  }, []);

  const userColumns = [
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "Name", dataIndex: "name", key: "name" },
    { title: "Username", dataIndex: "username", key: "username" },
    { title: "Email", dataIndex: "email", key: "email" },
  ];

  const postColumns = [
    { title: "ID", dataIndex: "id", key: "id" },
    { title: "User ID", dataIndex: "userId", key: "userId" },
    { title: "Title", dataIndex: "title", key: "title" },
    { title: "Body", dataIndex: "body", key: "body" },
  ];

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Users</h1>
      {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
      {loadingUsers ? <Spin /> : <Table dataSource={users} columns={userColumns} rowKey="id" />}

      <h1 style={{ marginTop: "2rem" }}>Posts</h1>
      {loadingPosts ? <Spin /> : <Table dataSource={posts} columns={postColumns} rowKey="id" />}
    </div>
  );
}

export default App;
