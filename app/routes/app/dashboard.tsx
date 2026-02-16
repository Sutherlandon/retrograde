import * as React from 'react';

interface HelloWorldProps {
  name: string;
}

const HelloWorld: React.FC<HelloWorldProps> = (props) => {
  return (
    <div>Hello, {props.name}!</div>
  );
};

export default HelloWorld;