using System;

class Program
{
    static void Main()
    {
        double d = 3.99;
        Console.WriteLine((int)d);
        Console.WriteLine((int)-3.99);
        Console.WriteLine((int)'A');
        Console.WriteLine((char)66);
        Console.WriteLine((char)('a' + 2));
        Console.WriteLine((double)5 / 2);
        double big = 3.9e10;
        Console.WriteLine((int)big);
        Console.WriteLine((int)(-big));
        double nan = Math.Sqrt(-1);
        Console.WriteLine((int)nan);
        Console.WriteLine(nan);
        int i = 65;
        char c = (char)i;
        Console.WriteLine(c);
        Console.WriteLine((int)2.5 + (int)3.5);
    }
}
