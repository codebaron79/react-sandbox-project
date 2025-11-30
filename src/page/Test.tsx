import { useEffect, useState } from "react";
import { ENDPOINT } from "../api/apiConfig";
import { callAPI } from "../api/apiService";

type User = {
  id: number;
  name: string;
  username: string;
  email: string;
  address: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
    geo: {
      lat: string;
      lng: string;
    };
  };
  phone: string;
  website: string;
  company: {
    name: string;
    catchPhrase: string;
    bs: string;
  };
};

export const Test: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  const fetchUsers = () => {
    callAPI<User[]>(ENDPOINT.USER).then((response: User[]) => {
      setUsers(response);
    });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <>
      {users.map((user) => (
        <p key={user.id}>{user.name}</p>
      ))}
    </>
  );
};
