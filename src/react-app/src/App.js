import logo from './logo.svg';

function App() {
  return (
    <Navbar/>
  );
}

function Navbar() {

  var Divider = <div className="p-2">•</div>;

  return (
    <div className="sm:container w-20 h-14 mx-auto bg-gray-900 border rounded-md drop-shadow-lg">
      <ul className="inline-flex text-white p-1.5">
        <object className="mx-3" aria-label="logo" data={logo} width="150" height="40"></object>
        <li className="p-2">Home</li>
        {Divider}
        <li className="p-2">Register</li>
        {Divider}
        <li className="p-2">Login</li>
        {Divider}
        <li className="p-2">Settings</li>
      </ul>
    </div>
  );
}

export default App;
