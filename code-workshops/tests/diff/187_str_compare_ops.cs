using System;

class Program
{
    static void Main()
    {
        string a = "abc"; string b = "ab";
        Console.WriteLine(a == b + "c");
        Console.WriteLine(a != b);
        Console.WriteLine(a.CompareTo(b) > 0);
        Console.WriteLine(a.Length > b.Length);
        string e = "";
        Console.WriteLine(e == "" && e.Length == 0);
        string n = null;
        Console.WriteLine(n == null);
    }
}
