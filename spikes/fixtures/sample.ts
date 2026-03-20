interface User {
  name: string;
  age: number;
  email: string;
}

function greetUser(user: User): string {
  const message = `Hello, ${user.name}!`;
  console.log(message);
  return message;
}

function calculateAge(birthYear: number): number {
  const currentYear = new Date().getFullYear();
  return currentYear - birthYear;
}

const alice: User = {
  name: 'Alice',
  age: calculateAge(1990),
  email: 'alice@example.com',
};

const result = greetUser(alice);
console.log(`Result: ${result}`);
