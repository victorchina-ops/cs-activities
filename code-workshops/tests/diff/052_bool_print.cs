using System;

class Program
{
    static void Main()
    {
        bool b = 3 > 2;
        Console.WriteLine(b);
        Console.WriteLine("b is " + b);
        Console.WriteLine(!b);
        Console.WriteLine(b == true);
        bool c = false;
        c = !c;
        Console.WriteLine(c);
        Console.WriteLine("{0} {1}", b, c);
    }
}
