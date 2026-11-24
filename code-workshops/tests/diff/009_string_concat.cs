using System;

class Program
{
    static void Main()
    {
        int n = 5; double d = 2.5; char c = 'x'; bool b = true;
        Console.WriteLine("n=" + n + " d=" + d + " c=" + c + " b=" + b);
        Console.WriteLine(1 + 2 + "x" + 1 + 2);
        Console.WriteLine('a' + 'b' + "c");
        Console.WriteLine("" + 'a' + 'b');
        Console.WriteLine('a' + 1);
        Console.WriteLine((char)('a' + 1));
        Console.WriteLine("sum: " + (n + 3));
        Console.WriteLine("sum: " + n + 3);
        string s = null;
        Console.WriteLine("[" + s + "]");
        Console.WriteLine(n + d + "!");
        Console.WriteLine(10 / 4 + "|" + 10 / 4.0 + "|" + 10 % 4);
    }
}
